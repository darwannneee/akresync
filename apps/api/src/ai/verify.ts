import type { DocCheck } from '@akreditasi/shared';
import { extractPdfPages, extractSheets } from './extract.js';

/** Versi aturan pemeriksaan jenis dokumen (tanpa model AI). */
export const VERIFY_RULES_VERSION = 'rules-v1';
export const RULES_MODEL = 'aturan-sistem';

const now = () => new Date().toISOString();
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ');

export const pendingCheck = (reason: string, model: string | null = RULES_MODEL): DocCheck => ({
  status: 'pending', isValid: null, detectedType: null, reason, model, modelVersion: VERIFY_RULES_VERSION, inputTokens: null, outputTokens: null, latencyMs: null, at: now(),
});
const ruleCheck = (ok: boolean, detectedType: string, reason: string, started: number): DocCheck => ({
  status: ok ? 'verified' : 'mismatch', isValid: ok, detectedType, reason, model: RULES_MODEL, modelVersion: VERIFY_RULES_VERSION, inputTokens: null, outputTokens: null, latencyMs: Date.now() - started, at: now(),
});

const isPdf = (b: Buffer) => b.subarray(0, 5).toString('latin1') === '%PDF-';
const isZip = (b: Buffer) => b[0] === 0x50 && b[1] === 0x4b;

/** Kata kunci khas: cukup salah satu ditemukan agar dianggap sesuai (toleran terhadap variasi templat). */
const words = (list: string[]) => list.map((k) => ({ k, re: new RegExp(`(^|[^a-z])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`) }));
const LED_KEYS = words(['laporan evaluasi diri', 'evaluasi diri', 'led', 'visi, misi', 'visi misi', 'analisis swot', 'kriteria 1', 'kriteria i']);
const LKPS_KEYS = words(['laporan kinerja program studi', 'lkps', 'dosen tetap', 'mahasiswa', 'penelitian', 'pengabdian', 'kerjasama', 'kerja sama', 'luaran']);

export type VerifyOutcome =
  | { kind: 'verified'; check: DocCheck }
  | { kind: 'invalid'; check: DocCheck; message: string };

/**
 * Pemeriksaan jenis LED/LKPS berbasis aturan, tanpa memanggil layanan AI:
 * format biner (PDF / XLSX), teks dapat dibaca, dan kata kunci khas dokumen.
 */
export async function verifyByRules(docType: 'LED' | 'LKPS', data: Buffer): Promise<VerifyOutcome> {
  const started = Date.now();
  const bad = (detected: string, reason: string, message: string): VerifyOutcome => ({ kind: 'invalid', check: ruleCheck(false, detected, reason, started), message });
  if (docType === 'LED') {
    if (!isPdf(data)) return bad('bukan PDF', 'Berkas bukan PDF.', 'LED harus berupa berkas PDF.');
    let text = '';
    try {
      const { pages } = await extractPdfPages(data);
      text = norm(pages.slice(0, 15).map((p) => p.text).join(' '));
    } catch {
      return bad('PDF rusak', 'PDF tidak dapat dibuka.', 'Berkas PDF tidak dapat dibuka. Pastikan berkas tidak rusak atau terkunci kata sandi.');
    }
    if (text.length < 200) return bad('PDF tanpa teks', 'Teks PDF tidak dapat dibaca (kemungkinan hasil pindai).', 'Teks pada PDF tidak dapat dibaca. Unggah PDF hasil ekspor dokumen, bukan hasil pindai.');
    const hit = LED_KEYS.find((x) => x.re.test(text));
    if (!hit) return bad('dokumen lain', 'Tidak ditemukan ciri Laporan Evaluasi Diri pada 15 halaman awal.', 'Berkas tidak terdeteksi sebagai Laporan Evaluasi Diri (LED). Mohon periksa kembali berkasnya.');
    return { kind: 'verified', check: ruleCheck(true, 'LED', `Ditemukan ciri LED ("${hit.k}").`, started) };
  }
  if (!isZip(data)) return bad('bukan Excel', 'Berkas bukan Excel (.xlsx).', 'LKPS harus berupa berkas Excel (.xlsx).');
  let sheets: Awaited<ReturnType<typeof extractSheets>>;
  try {
    sheets = await extractSheets(data);
  } catch {
    return bad('Excel rusak', 'Berkas Excel tidak dapat dibuka.', 'Berkas Excel tidak dapat dibuka. Simpan ulang sebagai .xlsx lalu unggah kembali.');
  }
  if (!sheets.length) return bad('Excel kosong', 'Tidak ada sheet berisi data.', 'Berkas Excel tidak berisi data.');
  const text = norm(sheets.map((s) => `${s.sheet} ${s.rows.slice(0, 15).map((r) => r.text).join(' ')}`).join(' '));
  const hits = LKPS_KEYS.filter((x) => x.re.test(text)).map((x) => x.k);
  if (!hits.length) return bad('tabel lain', 'Tidak ditemukan ciri tabel LKPS.', 'Berkas tidak terdeteksi sebagai Laporan Kinerja Program Studi (LKPS). Mohon periksa kembali berkasnya.');
  return { kind: 'verified', check: ruleCheck(true, 'LKPS', `${sheets.length} sheet; ditemukan ciri LKPS (${hits.slice(0, 3).join(', ')}).`, started) };
}
