import type { RequestHandler, Router } from 'express';
import { z } from 'zod';
import { API_ROUTES, CHAIN_FUNCTIONS, type AssessmentResultPayload } from '@akreditasi/shared';
import { hashSnapshot } from '@akreditasi/shared/node';
import { loadSubmissionForUser } from '../auth/rbac.js';
import type { AppContext } from '../context.js';
import { auditReceipt, recordAuditEvent } from '../db/outbox.js';
import { fromDbKey, q1, withTransaction, type Queryable } from '../db/pool.js';
import { badRequest, conflict, forbidden, notFound } from '../errors.js';
import { assertFlow, stateOf, type FlowAction } from '../flow.js';
import { envelope, mount, mountWith, parse, requestIdFrom, uuidParam } from '../lib/http.js';
import { executeChainAction, findReplay } from './chainAction.js';
import { assertAuditCommitted, camel, docDto, encryptAndStore, insertDocumentRow, requireFile, upload } from './common.js';

export const MAX_ITEM = 4;
export const MAX_TOTAL = 400;

/** Total dinormalisasi ke 0..400 dari butir bernilai 0..4. Mengembalikan null bila skor tidak valid. */
export function computeTotalScore(scores: unknown): number {
  if (!scores || typeof scores !== 'object' || Array.isArray(scores)) throw badRequest('scores harus berupa objek {kriteria: {butir: nilai}}');
  let sum = 0;
  let count = 0;
  for (const [crit, items] of Object.entries(scores as Record<string, unknown>)) {
    if (!items || typeof items !== 'object' || Array.isArray(items)) throw badRequest(`Kriteria ${crit} harus berupa objek butir`);
    for (const [item, v] of Object.entries(items as Record<string, unknown>)) {
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > MAX_ITEM) throw badRequest(`Nilai ${crit}.${item} harus angka 0-${MAX_ITEM}`);
      sum += v;
      count++;
    }
  }
  if (count === 0) throw badRequest('Skor tidak boleh kosong');
  return Math.round((sum / (count * MAX_ITEM)) * MAX_TOTAL * 100) / 100;
}

const phaseSchema = z.enum(['AK', 'AL']);

async function activeOffer(db: Queryable, submissionId: string) {
  const o = await q1(db, `SELECT * FROM assessor_offers WHERE submission_id=$1 AND status='effective' ORDER BY offer_no DESC LIMIT 1`, [submissionId]);
  if (!o) throw conflict('Belum ada penugasan asesor yang berlaku');
  return o;
}

function assertPhaseActor(offer: any, userId: string, phase: 'AK' | 'AL') {
  if (![offer.assessor1_id, offer.assessor2_id].includes(userId)) throw forbidden('Anda bukan asesor pada penugasan ini');
  if (phase === 'AL' && offer.lead_assessor_id !== userId) throw forbidden('Hanya ketua asesor yang dapat mengerjakan asesmen lapangan');
}

export function assessmentRoutes(ctx: AppContext, router: Router, auth: RequestHandler) {
  const flowFor = (phase: 'AK' | 'AL'): FlowAction => (phase === 'AK' ? 'assessment_ak' : 'assessment_al');

  mount(router, auth, API_ROUTES.saveAssessmentDraft, async (req, res) => {
    const user = req.user!;
    const id = uuidParam(req.params.id);
    const phase = parse(phaseSchema, req.params.phase);
    const b = parse(z.object({ scores: z.record(z.record(z.number())) }), req.body);
    const total = computeTotalScore(b.scores);
    const out = await withTransaction(async (c) => {
      const sub = await loadSubmissionForUser(c, user, id, { forUpdate: true });
      assertFlow(flowFor(phase), stateOf(sub));
      const offer = await activeOffer(c, id);
      assertPhaseActor(offer, user.id, phase);
      const existing = await q1(c, `SELECT * FROM assessments WHERE offer_id=$1 AND assessor_id=$2 AND phase=$3 FOR UPDATE`, [offer.id, user.id, phase]);
      if (existing?.status === 'submitted' && !(phase === 'AK' && sub.ak_status === 'consistency_returned')) throw conflict('Penilaian sudah diserahkan dan tidak dapat diubah');
      const row = await q1(
        c,
        `INSERT INTO assessments (submission_id, offer_id, assessor_id, phase, scores, total_score)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6)
         ON CONFLICT (offer_id, assessor_id, phase) DO UPDATE SET scores=EXCLUDED.scores, total_score=EXCLUDED.total_score, version=assessments.version+1, updated_at=now()
         RETURNING *`,
        [id, offer.id, user.id, phase, JSON.stringify(b.scores), total],
      );
      const ev = await recordAuditEvent(c, { aggregateType: 'assessment', aggregateId: row!.id, submissionId: id, kind: 'AssessmentDraftSaved', version: row!.version, snapshot: row!, actor: { uid: user.id, role: user.role } });
      return { row: row!, ev };
    }, ctx.pool);
    res.json(envelope({ ...camel(out.row), totalScore: Number(out.row.total_score) }, { audit: auditReceipt([out.ev]) }));
  });

  mountWith(router, auth, API_ROUTES.uploadAlMinutes, [upload.single('file')], async (req, res) => {
    const user = req.user!;
    const id = uuidParam(req.params.id);
    const file = requireFile(req.file);
    const pre = await loadSubmissionForUser(ctx.pool, user, id);
    assertFlow('assessment_al', stateOf(pre));
    assertPhaseActor(await activeOffer(ctx.pool, id), user.id, 'AL');
    const blob = await encryptAndStore(ctx, file.buffer, file.originalname);
    const out = await withTransaction(async (c) => {
      const sub = await loadSubmissionForUser(c, user, id, { forUpdate: true });
      assertFlow('assessment_al', stateOf(sub));
      const offer = await activeOffer(c, id);
      const doc = await insertDocumentRow(c, { submissionId: id, setVersion: sub.document_set_version, docType: 'AL_MINUTES', fileName: file.originalname, mimeType: file.mimetype, blob, uploadedBy: user.id });
      await c.query(
        `INSERT INTO assessments (submission_id, offer_id, assessor_id, phase, minutes_document_id) VALUES ($1,$2,$3,'AL',$4)
         ON CONFLICT (offer_id, assessor_id, phase) DO UPDATE SET minutes_document_id=EXCLUDED.minutes_document_id, updated_at=now()`,
        [id, offer.id, user.id, doc.id],
      );
      const ev = await recordAuditEvent(c, { aggregateType: 'document_version', aggregateId: doc.id, submissionId: id, kind: 'DocumentVersionSaved', version: sub.document_set_version, snapshot: doc, actor: { uid: user.id, role: user.role } });
      return { doc, ev };
    }, ctx.pool);
    res.status(201).json(envelope(docDto(out.doc), { audit: auditReceipt([out.ev]) }));
  });

  mount(router, auth, API_ROUTES.submitAssessment, async (req, res) => {
    const user = req.user!;
    const id = uuidParam(req.params.id);
    const phase = parse(phaseSchema, req.params.phase);
    const reasonIn = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    const requestId = requestIdFrom(req);
    const replay = await findReplay(ctx, requestId, user.id, id);
    if (replay) return void res.json(envelope({ submissionId: id, phase, replayed: true }, { chain: replay.chain }));
    const sub = await loadSubmissionForUser(ctx.pool, user, id);
    assertFlow(flowFor(phase), stateOf(sub));
    const offer = await activeOffer(ctx.pool, id);
    assertPhaseActor(offer, user.id, phase);
    const row = await q1(ctx.pool, `SELECT * FROM assessments WHERE offer_id=$1 AND assessor_id=$2 AND phase=$3`, [offer.id, user.id, phase]);
    if (!row || !row.scores || Object.keys(row.scores).length === 0) throw conflict('Simpan skor rinci (draf) terlebih dahulu sebelum menyerahkan');
    const total = computeTotalScore(row.scores);
    const summary = hashSnapshot(row.scores);
    let minutesCid: string | null = null;
    let minutesSha: string | null = null;
    if (phase === 'AL') {
      const doc = row.minutes_document_id ? await q1(ctx.pool, 'SELECT cid, sha256_plain FROM document_versions WHERE id=$1', [row.minutes_document_id]) : undefined;
      if (!doc) throw conflict('Berita acara AL wajib diunggah sebelum menyerahkan AL');
      minutesCid = doc.cid;
      minutesSha = String(doc.sha256_plain).trim();
      await assertAuditCommitted(ctx.pool, id, 'AKConsistencyApproved', 'Konsistensi AK');
      await assertAuditCommitted(ctx.pool, id, 'ALScheduleApproved', 'Persetujuan jadwal AL');
    }
    const payload: AssessmentResultPayload = { phase, offerSeq: offer.chain_seq, scoreSummarySha256: summary, totalScore: total, minutesCid, minutesSha256: minutesSha, documentSetVersion: sub.document_set_version };

    if (row.status === 'submitted') {
      // Penilaian ulang AK setelah dikembalikan KEA = koreksi atas catatan yang sama oleh asesor yang sama.
      if (!(phase === 'AK' && sub.ak_status === 'consistency_returned') || !row.chain_record_key) throw conflict('Penilaian sudah diserahkan');
      const latest = await q1(ctx.pool, `SELECT max(version) AS v FROM formal_records WHERE record_key=$1 AND status='committed'`, [row.chain_record_key]);
      const ev = await q1(ctx.pool, `SELECT id FROM outbox WHERE submission_id=$1 AND type='AKConsistencyReturned' ORDER BY created_at DESC LIMIT 1`, [id]);
      const reason = reasonIn || 'Penilaian ulang setelah konsistensi AK dikembalikan KEA';
      const r = await executeChainAction(ctx, {
        userId: user.id, submissionId: id, recordType: 'ASSESSMENT_RESULT', fn: CHAIN_FUNCTIONS.CorrectRecord, requestId,
        args: [requestId, fromDbKey(row.chain_record_key), JSON.stringify(payload), reason, ev ? `audit:${ev.id}` : 'audit:AKConsistencyReturned', String(latest?.v ?? 1)],
        payload, offChain: { reason },
      });
      return void res.json(envelope({ submissionId: id, phase, totalScore: total, corrected: true }, { chain: r.chain }));
    }
    const r = await executeChainAction(ctx, { userId: user.id, submissionId: id, recordType: 'ASSESSMENT_RESULT', fn: CHAIN_FUNCTIONS.SubmitAssessmentResult, requestId, args: [requestId, id, JSON.stringify(payload)], payload });
    res.status(201).json(envelope({ submissionId: id, phase, totalScore: total, scoreSummarySha256: summary }, { chain: r.chain }));
  });

  mount(router, auth, API_ROUTES.akConsistency, async (req, res) => {
    const user = req.user!;
    const id = uuidParam(req.params.id);
    const b = parse(z.object({ result: z.enum(['approved', 'returned']), notes: z.string().trim().max(5000).optional() }), req.body);
    if (b.result === 'returned' && !b.notes) throw badRequest('Catatan wajib diisi saat mengembalikan AK');
    const out = await withTransaction(async (c) => {
      const sub = await loadSubmissionForUser(c, user, id, { forUpdate: true });
      assertFlow('ak_consistency', stateOf(sub));
      const offer = await activeOffer(c, id);
      const o = await q1(c, `UPDATE assessor_offers SET consistency_status=$2, consistency_notes=$3, consistency_by=$4, consistency_at=now(), version=version+1 WHERE id=$1 RETURNING *`, [offer.id, b.result, b.notes ?? null, user.id]);
      await c.query(`UPDATE submissions SET ak_status=$2, updated_at=now() WHERE id=$1`, [id, b.result === 'approved' ? 'consistency_approved' : 'consistency_returned']);
      const ev = await recordAuditEvent(c, {
        aggregateType: 'assessor_offer', aggregateId: offer.id, submissionId: id, kind: b.result === 'approved' ? 'AKConsistencyApproved' : 'AKConsistencyReturned',
        version: o!.version, snapshot: o!, actor: { uid: user.id, role: user.role },
      });
      return { o: o!, ev };
    }, ctx.pool);
    res.json(envelope(camel(out.o), { audit: auditReceipt([out.ev]) }));
  });

  void notFound;
}
