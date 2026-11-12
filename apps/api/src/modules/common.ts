import { createHash } from 'node:crypto';
import multer from 'multer';
import type { DocumentType } from '@akreditasi/shared';
import { sha256Hex } from '@akreditasi/shared/node';
import type { AppContext } from '../context.js';
import { encryptFile, decryptFile } from '../crypto/envelope.js';
import { q, q1, type Queryable } from '../db/pool.js';
import { badRequest, conflict } from '../errors.js';

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });

const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'application/x-zip-compressed',
  'image/png',
  'image/jpeg',
  'text/plain',
  'text/csv',
  'application/octet-stream',
]);

export function requireFile(file: Express.Multer.File | undefined): Express.Multer.File {
  if (!file) throw badRequest('Berkas wajib diunggah pada field "file"');
  if (file.size === 0) throw badRequest('Berkas kosong');
  if (!ALLOWED_MIME.has(file.mimetype)) throw badRequest(`Tipe berkas ${file.mimetype} tidak diizinkan`);
  return file;
}

export const sanitizeFileName = (n: string): string => n.replace(/[\r\n"\\/]/g, '_').slice(0, 200) || 'berkas';

export interface StoredBlob {
  cid: string;
  sha256: string;
  sizeBytes: number;
  wrappedDek: Buffer;
  dekIv: Buffer;
  dekTag: Buffer;
  fileIv: Buffer;
  fileTag: Buffer;
}

/** Enkripsi (envelope AES-256-GCM) lalu unggah ciphertext ke IPFS. Dilakukan DI LUAR transaksi SQL. */
export async function encryptAndStore(ctx: AppContext, data: Buffer, name: string): Promise<StoredBlob> {
  const enc = encryptFile(data, ctx.config.DOCUMENT_MASTER_KEY);
  const cid = await ctx.ipfs.add(enc.ciphertext, name);
  return { cid, sha256: sha256Hex(data), sizeBytes: data.length, wrappedDek: enc.wrappedDek, dekIv: enc.dekIv, dekTag: enc.dekTag, fileIv: enc.fileIv, fileTag: enc.fileTag };
}

export async function insertDocumentRow(
  db: Queryable,
  p: { submissionId: string; setVersion: number; docType: DocumentType; fileName: string; mimeType: string; blob: StoredBlob; uploadedBy: string },
): Promise<Record<string, any>> {
  const rows = await q(
    db,
    `INSERT INTO document_versions (submission_id, set_version, doc_type, file_name, mime_type, size_bytes, sha256_plain, cid,
        wrapped_dek, dek_iv, dek_tag, file_iv, file_tag, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING id, submission_id, set_version, doc_type, file_name, mime_type, size_bytes, sha256_plain, cid, uploaded_by, created_at`,
    [p.submissionId, p.setVersion, p.docType, sanitizeFileName(p.fileName), p.mimeType, p.blob.sizeBytes, p.blob.sha256, p.blob.cid, p.blob.wrappedDek, p.blob.dekIv, p.blob.dekTag, p.blob.fileIv, p.blob.fileTag, p.uploadedBy],
  );
  return rows[0]!;
}

export async function fetchAndDecrypt(ctx: AppContext, doc: any): Promise<Buffer> {
  const ciphertext = await ctx.ipfs.cat(doc.cid);
  let plain: Buffer;
  try {
    plain = decryptFile(
      { ciphertext, fileIv: doc.file_iv, fileTag: doc.file_tag, wrappedDek: doc.wrapped_dek, dekIv: doc.dek_iv, dekTag: doc.dek_tag },
      ctx.config.DOCUMENT_MASTER_KEY,
    );
  } catch {
    throw conflict('Integritas berkas gagal: dekripsi menolak data (ciphertext rusak/diubah)');
  }
  if (createHash('sha256').update(plain).digest('hex') !== String(doc.sha256_plain).trim()) {
    throw conflict('Integritas berkas gagal: SHA-256 tidak cocok dengan catatan');
  }
  return plain;
}

export const docDto = (d: any) => ({
  id: d.id,
  submissionId: d.submission_id,
  setVersion: d.set_version,
  docType: d.doc_type,
  fileName: d.file_name,
  mimeType: d.mime_type,
  sizeBytes: Number(d.size_bytes),
  sha256: String(d.sha256_plain).trim(),
  sha256Plain: String(d.sha256_plain).trim(),
  cid: d.cid,
  uploadedBy: d.uploaded_by,
  createdAt: d.created_at,
});

/**
 * Pastikan peristiwa audit prasyarat sudah tercatat on-chain (cek lebih awal agar pesan galat jelas;
 * chaincode tetap otoritas).
 */
export async function assertAuditCommitted(db: Queryable, submissionId: string, kind: string, label: string): Promise<void> {
  const row = await q1<{ status: string }>(
    db,
    `SELECT a.status FROM outbox o JOIN audit_status a ON a.event_id = o.id
     WHERE o.submission_id = $1 AND o.type = $2 ORDER BY o.created_at DESC LIMIT 1`,
    [submissionId, kind],
  );
  if (!row) throw conflict(`${label} belum tercatat (peristiwa ${kind} belum ada)`);
  if (row.status !== 'committed') throw conflict(`${label} belum tercatat on-chain (status audit ${kind}: ${row.status}); coba lagi setelah audit tersimpan`);
}

export const camel = (row: Record<string, any>): Record<string, any> =>
  Object.fromEntries(Object.entries(row).map(([k, v]) => [k.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase()), v]));

export const asNumber = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
