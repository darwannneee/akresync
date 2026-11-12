import type { RequestHandler, Router } from 'express';
import { z } from 'zod';
import { API_ROUTES } from '@akreditasi/shared';
import { loadSubmissionForUser } from '../auth/rbac.js';
import type { AppContext } from '../context.js';
import { auditReceipt, recordAuditEvent } from '../db/outbox.js';
import { q1, withTransaction, type Queryable } from '../db/pool.js';
import { badRequest, conflict, forbidden } from '../errors.js';
import { assertFlow, stateOf } from '../flow.js';
import { envelope, mount, parse, uuidParam } from '../lib/http.js';
import { camel } from './common.js';

async function lastObjectionOpen(db: Queryable, id: string): Promise<boolean> {
  const last = await q1(db, `SELECT response_type FROM upps_responses WHERE submission_id=$1 ORDER BY created_at DESC, id LIMIT 1`, [id]);
  return last?.response_type === 'objection';
}

export function responseRoutes(ctx: AppContext, router: Router, auth: RequestHandler) {
  mount(router, auth, API_ROUTES.uppsResponse, async (req, res) => {
    const user = req.user!;
    const id = uuidParam(req.params.id);
    const b = parse(z.object({ type: z.enum(['accept', 'objection']), body: z.string().trim().max(10000).optional() }), req.body);
    if (b.type === 'objection' && !b.body) throw badRequest('Uraian keberatan wajib diisi');
    const out = await withTransaction(async (c) => {
      const sub = await loadSubmissionForUser(c, user, id, { forUpdate: true });
      assertFlow('upps_response', stateOf(sub));
      if (await lastObjectionOpen(c, id)) throw conflict('Keberatan Anda masih menunggu respons ketua asesor');
      if (await q1(c, `SELECT 1 FROM upps_responses WHERE submission_id=$1 AND response_type='objection'`, [id])) throw conflict('Keberatan hanya dapat diajukan satu kali; tanggapan sudah ditutup');
      const r = await q1(c, `INSERT INTO upps_responses (submission_id, responder_role, responder_id, response_type, body) VALUES ($1,'upps',$2,$3,$4) RETURNING *`, [id, user.id, b.type, b.body ?? 'Menerima hasil asesmen']);
      const actor = { uid: user.id, role: user.role };
      const ids = [await recordAuditEvent(c, { aggregateType: 'upps_response', aggregateId: r!.id, submissionId: id, kind: 'UPPSResponseSubmitted', version: 1, snapshot: r!, actor })];
      if (b.type === 'accept') {
        await c.query(`UPDATE submissions SET stage='responses_completed', updated_at=now() WHERE id=$1`, [id]);
        ids.push(await recordAuditEvent(c, { aggregateType: 'upps_response', aggregateId: r!.id, submissionId: id, kind: 'ResponsesCompleted', version: 1, snapshot: { submissionId: id, completedBy: 'upps_accept', responseId: r!.id }, actor }));
      }
      return { r: r!, ids };
    }, ctx.pool);
    res.status(201).json(envelope(camel(out.r), { audit: auditReceipt(out.ids) }));
  });

  mount(router, auth, API_ROUTES.leadResponse, async (req, res) => {
    const user = req.user!;
    const id = uuidParam(req.params.id);
    const b = parse(z.object({ body: z.string().trim().min(1).max(10000) }), req.body);
    const out = await withTransaction(async (c) => {
      const sub = await loadSubmissionForUser(c, user, id, { forUpdate: true });
      assertFlow('lead_response', stateOf(sub));
      const offer = await q1(c, `SELECT * FROM assessor_offers WHERE submission_id=$1 AND status='effective' ORDER BY offer_no DESC LIMIT 1`, [id]);
      if (!offer || offer.lead_assessor_id !== user.id) throw forbidden('Hanya ketua asesor yang dapat menanggapi keberatan');
      if (!(await lastObjectionOpen(c, id))) throw conflict('Tidak ada keberatan UPPS yang menunggu respons');
      const r = await q1(c, `INSERT INTO upps_responses (submission_id, responder_role, responder_id, response_type, body) VALUES ($1,'lead_assessor',$2,'resolution',$3) RETURNING *`, [id, user.id, b.body]);
      await c.query(`UPDATE submissions SET stage='responses_completed', updated_at=now() WHERE id=$1`, [id]);
      const actor = { uid: user.id, role: user.role };
      const ids = [
        await recordAuditEvent(c, { aggregateType: 'upps_response', aggregateId: r!.id, submissionId: id, kind: 'LeadAssessorResponseSubmitted', version: 1, snapshot: r!, actor }),
        await recordAuditEvent(c, { aggregateType: 'upps_response', aggregateId: r!.id, submissionId: id, kind: 'ResponsesCompleted', version: 1, snapshot: { submissionId: id, completedBy: 'lead_resolution', responseId: r!.id }, actor }),
      ];
      return { r: r!, ids };
    }, ctx.pool);
    res.status(201).json(envelope(camel(out.r), { audit: auditReceipt(out.ids) }));
  });
}
