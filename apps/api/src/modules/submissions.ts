import type { RequestHandler, Router } from 'express';
import { z } from 'zod';
import { API_ROUTES, DOCUMENT_TYPES, type AdminVerificationPayload, type DocumentType, type SubmissionPayload, CHAIN_FUNCTIONS } from '@akreditasi/shared';
import { sha256Hex } from '@akreditasi/shared/node';
import { loadSubmissionForUser } from '../auth/rbac.js';
import type { AppContext } from '../context.js';
import { q, q1, withTransaction, type Queryable } from '../db/pool.js';
import { recordAuditEvent, auditReceipt } from '../db/outbox.js';
import { badRequest, conflict, forbidden, notFound } from '../errors.js';
import { assertFlow, stateOf } from '../flow.js';
import { envelope, mount, mountWith, parse, requestIdFrom, uuidParam } from '../lib/http.js';
import { executeChainAction, findReplay } from './chainAction.js';
import { asNumber, camel, docDto, encryptAndStore, fetchAndDecrypt, insertDocumentRow, requireFile, upload, sanitizeFileName } from './common.js';
import type { AuthUser } from '../auth/types.js';

const MAIN_TYPES = ['LED', 'LKPS', 'SUPPORT'] as const;

/** Versi set dokumen terakhir yang sudah dikirim ke chain (SUBMISSION ter-commit), atau 0. */
export async function lastSubmittedSetVersion(db: Queryable, submissionId: string): Promise<number> {
  const r = await q1<{ v: number | null }>(
    db,
    `SELECT max((payload->>'documentSetVersion')::int) AS v FROM formal_records WHERE submission_id=$1 AND record_type='SUBMISSION' AND status='committed'`,
    [submissionId],
  );
  return r?.v ?? 0;
}

const submissionDto = (r: any) => ({
  id: r.id,
  uppsUserId: r.upps_user_id,
  institutionId: r.institution_id,
  institutionName: r.institution_name,
  programId: r.program_id,
  programName: r.program_name,
  programLevel: r.program_level,
  stage: r.stage,
  akStatus: r.ak_status,
  alScheduleStatus: r.al_schedule_status,
  documentSetVersion: r.document_set_version,
  chainStage: r.chain_stage,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const SUB_SELECT = `SELECT s.*, i.name AS institution_name, p.name AS program_name, p.level AS program_level
  FROM submissions s JOIN institutions i ON i.id = s.institution_id JOIN study_programs p ON p.id = s.program_id`;

const adminSchema = z.object({
  result: z.string().transform((v) => v.toUpperCase()).pipe(z.enum(['APPROVED', 'REVISION_REQUIRED', 'REJECTED'])),
  notes: z.string().trim().max(5000).optional(),
});

export async function buildDetail(ctx: AppContext, user: AuthUser, id: string) {
  const sub = await loadSubmissionForUser(ctx.pool, user, id);
  const full = (await q1(ctx.pool, `${SUB_SELECT} WHERE s.id = $1`, [id]))!;
  const [documents, payments, offers, schedules, responses, formal, audit, cert, assessments] = await Promise.all([
    q(ctx.pool, `SELECT id, submission_id, set_version, doc_type, file_name, mime_type, size_bytes, sha256_plain, cid, uploaded_by, created_at FROM document_versions WHERE submission_id=$1 ORDER BY created_at`, [id]),
    q(ctx.pool, `SELECT id, version, invoice_no, amount, status, issued_at, proof_document_id, proof_uploaded_at, verified_at, notes FROM payments WHERE submission_id=$1 ORDER BY issued_at`, [id]),
    q(ctx.pool, `SELECT o.*, a1.full_name AS assessor1_name, a2.full_name AS assessor2_name, l.full_name AS lead_assessor_name
      FROM assessor_offers o JOIN users a1 ON a1.id=o.assessor1_id JOIN users a2 ON a2.id=o.assessor2_id JOIN users l ON l.id=o.lead_assessor_id
      WHERE o.submission_id=$1 ORDER BY o.offer_no`, [id]),
    q(ctx.pool, `SELECT * FROM al_schedules WHERE submission_id=$1 ORDER BY version`, [id]),
    q(ctx.pool, `SELECT id, responder_role, responder_id, response_type, body, created_at FROM upps_responses WHERE submission_id=$1 ORDER BY created_at`, [id]),
    q(
      ctx.pool,
      `SELECT f.id, f.record_type, f.record_key, f.seq, f.version, f.request_id, f.actor_user_id, u.role AS actor_role, f.payload, f.payload_bytes, f.tx_id, f.block_number, f.status, f.error, f.off_chain, f.created_at, f.committed_at
       FROM formal_records f LEFT JOIN users u ON u.id = f.actor_user_id WHERE f.submission_id=$1 ORDER BY f.created_at, f.version`,
      [id],
    ),
    q(
      ctx.pool,
      `SELECT o.id AS event_id, o.type AS kind, o.aggregatetype AS aggregate_type, o.aggregateid AS aggregate_id, o.created_at, o.payload->'event'->>'version' AS version,
              o.payload->'event'->>'actorUid' AS actor_uid, o.payload->'event'->>'payloadSha256' AS payload_sha256,
              a.status, a.attempts, a.tx_id, a.block_number, a.last_error, a.committed_at
       FROM outbox o JOIN audit_status a ON a.event_id = o.id WHERE o.submission_id=$1 ORDER BY o.created_at`,
      [id],
    ),
    q1(ctx.pool, `SELECT id, certificate_no, document_id, issued_at FROM certificates WHERE submission_id=$1`, [id]),
    user.role === 'upps'
      ? Promise.resolve([])
      : q(ctx.pool, `SELECT a.id, a.offer_id, a.assessor_id, u.full_name AS assessor_name, a.phase, a.version, a.status, a.scores, a.total_score, a.score_summary_sha256, a.minutes_document_id, a.chain_record_key, a.submitted_at FROM assessments a JOIN users u ON u.id=a.assessor_id WHERE a.submission_id=$1 ${user.role === 'asesor' ? 'AND a.assessor_id = $2' : ''}`, user.role === 'asesor' ? [id, user.id] : [id]),
  ]);
  const hideOffchain = (r: any) => (user.role === 'upps' || user.role === 'asesor' ? { ...r, off_chain: undefined } : r);
  const auditByEvent = new Map(audit.map((a: any) => [a.aggregateId, a]));
  void auditByEvent;
  return {
    ...submissionDto(full),
    documents: documents.map(docDto),
    payments: payments.map((p) => ({ ...camel(p), amount: Number(p.amount) })),
    offers: offers.map((o) => ({ ...camel(o), rejectionReason: null })),
    alSchedules: schedules.map(camel),
    responses: responses.map(camel),
    assessments: assessments.map((a: any) => ({ ...camel(a), totalScore: asNumber(a.total_score) })),
    records: formal.map((f: any) => {
      const oc = f.off_chain as Record<string, any> | null;
      return {
        ...camel(hideOffchain(f)),
        actorUid: f.actor_user_id,
        blockNumber: asNumber(f.block_number),
        correction: f.version > 1 && oc?.reason ? { reason: oc.reason, evidenceRef: oc.evidenceRef ?? '' } : null,
      };
    }),
    audit: audit.map((a: any) => ({ ...camel(a), version: Number(a.version), blockNumber: asNumber(a.block_number), actorRole: undefined })),
    certificate: cert ? camel(cert) : null,
    _owner: sub.upps_user_id,
  };
}

export function submissionRoutes(ctx: AppContext, router: Router, auth: RequestHandler) {
  mount(router, auth, API_ROUTES.createDraft, async (req, res) => {
    const b = parse(z.object({ programId: z.string().uuid() }), req.body);
    const user = req.user!;
    const prog = await q1(ctx.pool, 'SELECT institution_id FROM study_programs WHERE id=$1', [b.programId]);
    if (!prog) throw badRequest('Program studi tidak ditemukan');
    if (prog.institution_id !== user.institutionId) throw forbidden('Program studi bukan milik institusi Anda');
    const row = await q1(ctx.pool, `INSERT INTO submissions (upps_user_id, institution_id, program_id) VALUES ($1,$2,$3) RETURNING id`, [user.id, prog.institution_id, b.programId]);
    res.status(201).json(envelope({ ...submissionDto((await q1(ctx.pool, `${SUB_SELECT} WHERE s.id=$1`, [row!.id]))!), id: row!.id }));
  });

  mount(router, auth, API_ROUTES.listSubmissions, async (req, res) => {
    const user = req.user!;
    const stage = typeof req.query.stage === 'string' ? req.query.stage : null;
    const params: unknown[] = [];
    const where: string[] = [];
    if (user.role === 'upps') {
      params.push(user.id);
      where.push(`s.upps_user_id = $${params.length}`);
    } else if (user.role === 'asesor') {
      params.push(user.id);
      where.push(`EXISTS (SELECT 1 FROM assessor_offers o WHERE o.submission_id = s.id AND $${params.length} IN (o.assessor1_id, o.assessor2_id))`);
    }
    if (stage) {
      params.push(stage);
      where.push(`s.stage = $${params.length}`);
    }
    const rows = await q(ctx.pool, `${SUB_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY s.updated_at DESC LIMIT 500`, params);
    res.json(envelope(rows.map(submissionDto)));
  });

  mount(router, auth, API_ROUTES.getSubmission, async (req, res) => {
    const { _owner, ...detail } = await buildDetail(ctx, req.user!, uuidParam(req.params.id));
    void _owner;
    res.json(envelope(detail));
  });

  // ---- unggah dokumen (A) ----
  mountWith(router, auth, API_ROUTES.uploadDocument, [upload.single('file')], async (req, res) => {
    const user = req.user!;
    const id = uuidParam(req.params.id);
    const docType = parse(z.enum(DOCUMENT_TYPES).refine((t) => (MAIN_TYPES as readonly string[]).includes(t), 'docType harus LED, LKPS, atau SUPPORT'), req.body?.docType) as DocumentType;
    const file = requireFile(req.file);
    const pre = await loadSubmissionForUser(ctx.pool, user, id);
    assertFlow('upload_document', stateOf(pre));
    const blob = await encryptAndStore(ctx, file.buffer, file.originalname);
    const result = await withTransaction(async (c) => {
      const sub = await loadSubmissionForUser(c, user, id, { forUpdate: true });
      assertFlow('upload_document', stateOf(sub));
      let setVersion: number = sub.document_set_version;
      const sealed = (await lastSubmittedSetVersion(c, id)) >= setVersion;
      const dup = docType !== 'SUPPORT' && (await q1(c, 'SELECT 1 FROM document_versions WHERE submission_id=$1 AND set_version=$2 AND doc_type=$3', [id, setVersion, docType]));
      if (sealed || dup) {
        // Set baru: salin dokumen set lama kecuali jenis yang diganti.
        const newVersion = setVersion + 1;
        await c.query(
          `INSERT INTO document_versions (submission_id, set_version, doc_type, file_name, mime_type, size_bytes, sha256_plain, cid, wrapped_dek, dek_iv, dek_tag, file_iv, file_tag, uploaded_by)
           SELECT submission_id, $3, doc_type, file_name, mime_type, size_bytes, sha256_plain, cid, wrapped_dek, dek_iv, dek_tag, file_iv, file_tag, uploaded_by
           FROM document_versions WHERE submission_id=$1 AND set_version=$2 AND doc_type IN ('LED','LKPS','SUPPORT') AND ($4 = 'SUPPORT' OR doc_type <> $4)`,
          [id, setVersion, newVersion, docType],
        );
        setVersion = newVersion;
        await c.query('UPDATE submissions SET document_set_version=$2, updated_at=now() WHERE id=$1', [id, setVersion]);
      }
      const doc = await insertDocumentRow(c, { submissionId: id, setVersion, docType, fileName: file.originalname, mimeType: file.mimetype, blob, uploadedBy: user.id });
      const eventId = await recordAuditEvent(c, {
        aggregateType: 'document_version',
        aggregateId: doc.id,
        submissionId: id,
        kind: 'DocumentVersionSaved',
        version: setVersion,
        snapshot: doc,
        actor: { uid: user.id, role: user.role },
      });
      return { doc, eventId };
    }, ctx.pool);
    res.status(201).json(envelope(docDto(result.doc), { audit: auditReceipt([result.eventId]) }));
  });

  mount(router, auth, API_ROUTES.downloadDocument, async (req, res) => {
    const user = req.user!;
    const doc = await q1(ctx.pool, 'SELECT * FROM document_versions WHERE id=$1', [uuidParam(req.params.documentId)]);
    if (!doc) throw notFound('Dokumen tidak ditemukan');
    await loadSubmissionForUser(ctx.pool, user, doc.submission_id);
    if (doc.doc_type === 'PAYMENT_PROOF' && !['upps', 'sek_keu', 'sek_adm'].includes(user.role)) throw forbidden('Bukti bayar hanya dapat diakses UPPS pemilik dan Sekretariat');
    const plain = await fetchAndDecrypt(ctx, doc);
    res.setHeader('Content-Type', doc.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFileName(doc.file_name)}"`);
    res.setHeader('X-Content-Sha256', String(doc.sha256_plain).trim());
    res.setHeader('X-Integrity-Verified', 'true');
    res.send(plain);
  });

  // ---- kirim pengajuan (C) ----
  mount(router, auth, API_ROUTES.submit, async (req, res) => {
    const user = req.user!;
    const id = uuidParam(req.params.id);
    const requestId = requestIdFrom(req);
    const replay = await findReplay(ctx, requestId, user.id, id);
    if (replay) return void res.json(envelope({ submissionId: id, replayed: true }, { chain: replay.chain }));
    const sub = await loadSubmissionForUser(ctx.pool, user, id);
    assertFlow('submit', stateOf(sub));
    const last = await lastSubmittedSetVersion(ctx.pool, id);
    if (sub.document_set_version <= last) throw conflict('Perbarui dokumen (set versi baru) sebelum mengirim ulang setelah revisi administrasi');
    const docs = await q(ctx.pool, `SELECT doc_type, cid, sha256_plain, size_bytes FROM document_versions WHERE submission_id=$1 AND set_version=$2 AND doc_type IN ('LED','LKPS','SUPPORT') ORDER BY doc_type, created_at`, [id, sub.document_set_version]);
    for (const t of ['LED', 'LKPS']) if (!docs.some((d) => d.doc_type === t)) throw conflict(`Dokumen ${t} wajib diunggah sebelum pengajuan`);
    const payload: SubmissionPayload = {
      institutionId: sub.institution_id,
      programId: sub.program_id,
      documentSetVersion: sub.document_set_version,
      documents: docs.map((d) => ({ type: d.doc_type, cid: d.cid, sha256: String(d.sha256_plain).trim(), sizeBytes: Number(d.size_bytes) })),
    };
    const r = await executeChainAction(ctx, { userId: user.id, submissionId: id, recordType: 'SUBMISSION', fn: CHAIN_FUNCTIONS.CreateSubmission, requestId, args: [requestId, id, JSON.stringify(payload)], payload });
    res.json(envelope({ submissionId: id, stage: 'submitted', documentSetVersion: payload.documentSetVersion }, { chain: r.chain }));
  });

  mount(router, auth, API_ROUTES.adminVerification, async (req, res) => {
    const user = req.user!;
    const id = uuidParam(req.params.id);
    const b = parse(adminSchema, req.body);
    if (b.result !== 'APPROVED' && !b.notes) throw badRequest('Catatan wajib diisi untuk hasil revisi atau penolakan');
    const requestId = requestIdFrom(req);
    const replay = await findReplay(ctx, requestId, user.id, id);
    if (replay) return void res.json(envelope({ submissionId: id, result: b.result, replayed: true }, { chain: replay.chain }));
    const sub = await loadSubmissionForUser(ctx.pool, user, id);
    assertFlow('admin_verification', stateOf(sub));
    const payload: AdminVerificationPayload = {
      documentSetVersion: sub.document_set_version,
      result: b.result,
      notesSha256: b.notes ? sha256Hex(b.notes.trim()) : null,
    };
    const r = await executeChainAction(ctx, {
      userId: user.id, submissionId: id, recordType: 'ADMIN_VERIFICATION', fn: CHAIN_FUNCTIONS.RecordAdminVerification, requestId,
      args: [requestId, id, JSON.stringify(payload)], payload, offChain: { notes: b.notes?.trim() ?? null },
    });
    const after = await q1(ctx.pool, 'SELECT stage FROM submissions WHERE id=$1', [id]);
    res.json(envelope({ submissionId: id, result: b.result, stage: after?.stage }, { chain: r.chain }));
  });
}
