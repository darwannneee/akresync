import { randomBytes, randomUUID } from 'node:crypto';
import type { RequestHandler, Router } from 'express';
import { z } from 'zod';
import PDFDocument from 'pdfkit';
import { ACCREDITATION_RANKS, API_ROUTES, CHAIN_FUNCTIONS, type DecisionPayload, type FinalVerificationPayload } from '@akreditasi/shared';
import { sha256Hex } from '@akreditasi/shared/node';
import { loadSubmissionForUser } from '../auth/rbac.js';
import type { AppContext } from '../context.js';
import { auditReceipt, recordAuditEvent } from '../db/outbox.js';
import { fromDbKey, q, q1, withTransaction } from '../db/pool.js';
import { badRequest, conflict, notFound } from '../errors.js';
import { assertFlow, stateOf } from '../flow.js';
import { envelope, mount, parse, requestIdFrom, uuidParam } from '../lib/http.js';
import { executeChainAction, findReplay } from './chainAction.js';
import { assertAuditCommitted, camel, encryptAndStore, fetchAndDecrypt, insertDocumentRow, sanitizeFileName } from './common.js';

const RANK_LABEL: Record<string, string> = { UNGGUL: 'Unggul', BAIK_SEKALI: 'Baik Sekali', BAIK: 'Baik', TIDAK_TERAKREDITASI: 'Tidak Terakreditasi' };
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'format YYYY-MM-DD');

const decisionSchema = z
  .object({ rank: z.enum(ACCREDITATION_RANKS), decreeNumber: z.string().trim().min(3).max(100), validFrom: date.nullish(), validUntil: date.nullish() })
  .superRefine((v, ctx) => {
    if (v.rank !== 'TIDAK_TERAKREDITASI') {
      if (!v.validFrom || !v.validUntil) ctx.addIssue({ code: 'custom', message: 'validFrom dan validUntil wajib untuk peringkat terakreditasi' });
      else if (v.validUntil <= v.validFrom) ctx.addIssue({ code: 'custom', message: 'validUntil harus setelah validFrom' });
    }
  });

export function renderCertificatePdf(d: {
  certificateNo: string; certificateId: string; institution: string; program: string; level: string; rank: string; totalScore: number;
  decreeNumber: string; validFrom: string | null; validUntil: string | null; txId: string; recordKey: string; issuedAt: string;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 60 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.fontSize(20).text('Sertifikat Hasil Akreditasi', { align: 'center' }).moveDown(0.5);
    doc.fontSize(11).text(`Nomor: ${d.certificateNo}`, { align: 'center' }).moveDown(2);
    doc.fontSize(12);
    for (const [k, v] of [
      ['Institusi', d.institution], ['Program Studi', `${d.program} (${d.level})`], ['Peringkat', d.rank], ['Skor Total', d.totalScore.toFixed(2)],
      ['Nomor SK', d.decreeNumber], ['Berlaku', d.validFrom && d.validUntil ? `${d.validFrom} s.d. ${d.validUntil}` : '-'], ['Diterbitkan', d.issuedAt],
    ] as const) doc.text(`${k}: ${v}`).moveDown(0.3);
    doc.moveDown(1.5).fontSize(10).text('Bukti on-chain', { underline: true }).moveDown(0.3);
    doc.text(`ID transaksi penetapan: ${d.txId}`);
    doc.text(`Kunci catatan: ${d.recordKey.split('\u0000').join('~')}`).moveDown(0.8);
    doc.text(`Verifikasi: unduh sertifikat melalui API (/api/v1/certificates/${d.certificateId}/download) untuk memvalidasi isi terhadap catatan penetapan di ledger.`);
    doc.end();
  });
}

export function finalizationRoutes(ctx: AppContext, router: Router, auth: RequestHandler) {
  mount(router, auth, API_ROUTES.finalVerification, async (req, res) => {
    const user = req.user!;
    const id = uuidParam(req.params.id);
    const b = parse(z.object({ notes: z.string().trim().max(5000).optional() }), req.body ?? {});
    const requestId = requestIdFrom(req);
    const replay = await findReplay(ctx, requestId, user.id, id);
    if (replay) return void res.json(envelope({ submissionId: id, replayed: true }, { chain: replay.chain }));
    const sub = await loadSubmissionForUser(ctx.pool, user, id);
    assertFlow('final_verification', stateOf(sub));
    await assertAuditCommitted(ctx.pool, id, 'ResponsesCompleted', 'Penyelesaian tanggapan');
    const offer = await q1(ctx.pool, `SELECT * FROM assessor_offers WHERE submission_id=$1 AND status='effective' ORDER BY offer_no DESC LIMIT 1`, [id]);
    if (!offer) throw conflict('Penugasan asesor yang berlaku tidak ditemukan');
    const ass = await q(ctx.pool, `SELECT assessor_id, phase, chain_record_key FROM assessments WHERE offer_id=$1 AND status='submitted' AND chain_record_key IS NOT NULL`, [offer.id]);
    const al = ass.find((a) => a.phase === 'AL');
    const a1 = ass.find((a) => a.phase === 'AK' && a.assessor_id === offer.assessor1_id);
    const a2 = ass.find((a) => a.phase === 'AK' && a.assessor_id === offer.assessor2_id);
    if (!al || !a1 || !a2) throw conflict('Catatan AK kedua asesor dan AL belum lengkap');
    const payload: FinalVerificationPayload = { alRecordKey: fromDbKey(al.chain_record_key), akRecordKeys: [fromDbKey(a1.chain_record_key), fromDbKey(a2.chain_record_key)], notesSha256: b.notes ? sha256Hex(b.notes.trim()) : null };
    const r = await executeChainAction(ctx, {
      userId: user.id, submissionId: id, recordType: 'FINAL_VERIFICATION', fn: CHAIN_FUNCTIONS.RecordFinalVerification, requestId,
      args: [requestId, id, JSON.stringify(payload)], payload, offChain: { notes: b.notes?.trim() ?? null },
    });
    res.json(envelope({ submissionId: id, stage: 'final_verified' }, { chain: r.chain }));
  });

  mount(router, auth, API_ROUTES.decision, async (req, res) => {
    const user = req.user!;
    const id = uuidParam(req.params.id);
    const b = parse(decisionSchema, req.body);
    const requestId = requestIdFrom(req);
    const replay = await findReplay(ctx, requestId, user.id, id);
    if (replay) return void res.json(envelope({ submissionId: id, replayed: true }, { chain: replay.chain }));
    const sub = await loadSubmissionForUser(ctx.pool, user, id);
    assertFlow('decision', stateOf(sub));
    const fv = await q1(ctx.pool, `SELECT record_key FROM formal_records WHERE submission_id=$1 AND record_type='FINAL_VERIFICATION' AND status='committed' ORDER BY seq DESC, version DESC LIMIT 1`, [id]);
    const al = await q1(
      ctx.pool,
      `SELECT a.total_score FROM assessments a JOIN assessor_offers o ON o.id=a.offer_id WHERE a.submission_id=$1 AND a.phase='AL' AND a.status='submitted' AND o.status='effective' LIMIT 1`,
      [id],
    );
    if (!fv || !al) throw conflict('Catatan verifikasi akhir atau AL belum tersedia');
    const isNot = b.rank === 'TIDAK_TERAKREDITASI';
    const payload: DecisionPayload = {
      rank: b.rank, totalScore: Number(al.total_score), decreeNumber: b.decreeNumber,
      validFrom: isNot ? null : (b.validFrom ?? null), validUntil: isNot ? null : (b.validUntil ?? null), finalVerificationKey: fromDbKey(fv.record_key),
    };
    const r = await executeChainAction(ctx, { userId: user.id, submissionId: id, recordType: 'DECISION', fn: CHAIN_FUNCTIONS.SetDecision, requestId, args: [requestId, id, JSON.stringify(payload)], payload });
    res.status(201).json(envelope({ submissionId: id, stage: 'decided', ...payload }, { chain: r.chain }));
  });

  mount(router, auth, API_ROUTES.issueCertificate, async (req, res) => {
    const user = req.user!;
    const id = uuidParam(req.params.id);
    const pre = await loadSubmissionForUser(ctx.pool, user, id);
    assertFlow('issue_certificate', stateOf(pre));
    const dec = await q1(
      ctx.pool,
      `SELECT * FROM formal_records WHERE submission_id=$1 AND record_type='DECISION' AND status='committed' ORDER BY version DESC LIMIT 1`,
      [id],
    );
    if (!dec) throw conflict('Catatan penetapan on-chain tidak ditemukan');
    const info = await q1(ctx.pool, `SELECT i.name AS institution, p.name AS program, p.level FROM submissions s JOIN institutions i ON i.id=s.institution_id JOIN study_programs p ON p.id=s.program_id WHERE s.id=$1`, [id]);
    const certId = randomUUID();
    const certNo = `CERT-${new Date().getFullYear()}-${randomBytes(4).toString('hex').toUpperCase()}`;
    const p = dec.payload as DecisionPayload;
    const pdf = await renderCertificatePdf({
      certificateNo: certNo, certificateId: certId, institution: info!.institution, program: info!.program, level: info!.level,
      rank: RANK_LABEL[p.rank] ?? p.rank, totalScore: Number(p.totalScore), decreeNumber: p.decreeNumber, validFrom: p.validFrom, validUntil: p.validUntil,
      txId: dec.tx_id, recordKey: fromDbKey(dec.record_key), issuedAt: new Date().toISOString().slice(0, 10),
    });
    const blob = await encryptAndStore(ctx, pdf, `${certNo}.pdf`);
    const out = await withTransaction(async (c) => {
      const sub = await loadSubmissionForUser(c, user, id, { forUpdate: true });
      assertFlow('issue_certificate', stateOf(sub));
      const doc = await insertDocumentRow(c, { submissionId: id, setVersion: sub.document_set_version, docType: 'CERTIFICATE', fileName: `${certNo}.pdf`, mimeType: 'application/pdf', blob, uploadedBy: user.id });
      const cert = await q1(c, `INSERT INTO certificates (id, submission_id, decision_record_id, certificate_no, document_id, issued_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [certId, id, dec.id, certNo, doc.id, user.id]);
      await c.query(`UPDATE submissions SET stage='released', updated_at=now() WHERE id=$1`, [id]);
      const ev = await recordAuditEvent(c, { aggregateType: 'certificate', aggregateId: certId, submissionId: id, kind: 'CertificateIssued', version: 1, snapshot: { ...cert!, documentSha256: blob.sha256, decisionTxId: dec.tx_id }, actor: { uid: user.id, role: user.role } });
      return { cert: cert!, ev };
    }, ctx.pool);
    res.status(201).json(envelope(camel(out.cert), { audit: auditReceipt([out.ev]) }));
  });

  mount(router, auth, API_ROUTES.downloadCertificate, async (req, res) => {
    const user = req.user!;
    const cert = await q1(ctx.pool, 'SELECT * FROM certificates WHERE id=$1', [uuidParam(req.params.certificateId)]);
    if (!cert) throw notFound('Sertifikat tidak ditemukan');
    await loadSubmissionForUser(ctx.pool, user, cert.submission_id);
    const doc = await q1(ctx.pool, 'SELECT * FROM document_versions WHERE id=$1', [cert.document_id]);
    const dec = await q1(ctx.pool, 'SELECT * FROM formal_records WHERE id=$1', [cert.decision_record_id]);
    if (!doc || !dec) throw notFound('Dokumen sertifikat tidak lengkap');
    const plain = await fetchAndDecrypt(ctx, doc);
    // Validasi ke keputusan on-chain: bandingkan isi keputusan di ledger dengan yang tercetak pada sertifikat.
    let verified: 'true' | 'false' | 'unavailable' = 'unavailable';
    try {
      const onChain = await ctx.chain.evaluate<{ payload: DecisionPayload; txId: string }>(user.id, CHAIN_FUNCTIONS.GetRecord, [fromDbKey(dec.record_key)]);
      const a = onChain?.payload;
      const b = dec.payload as DecisionPayload;
      verified = a && a.rank === b.rank && a.decreeNumber === b.decreeNumber && Number(a.totalScore) === Number(b.totalScore) && a.validFrom === b.validFrom && a.validUntil === b.validUntil && onChain.txId === dec.tx_id ? 'true' : 'false';
    } catch {
      verified = 'unavailable';
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFileName(doc.file_name)}"`);
    res.setHeader('X-Chain-Verified', verified);
    res.setHeader('X-Decision-Tx', dec.tx_id ?? '');
    res.setHeader('X-Content-Sha256', String(doc.sha256_plain).trim());
    res.send(plain);
  });
  void badRequest;
}
