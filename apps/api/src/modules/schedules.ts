import type { RequestHandler, Router } from 'express';
import { z } from 'zod';
import { API_ROUTES } from '@akreditasi/shared';
import { loadSubmissionForUser } from '../auth/rbac.js';
import type { AppContext } from '../context.js';
import { auditReceipt, recordAuditEvent } from '../db/outbox.js';
import { q1, withTransaction } from '../db/pool.js';
import { badRequest, conflict, notFound } from '../errors.js';
import { assertFlow, stateOf } from '../flow.js';
import { envelope, mount, parse, uuidParam } from '../lib/http.js';
import { camel } from './common.js';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'format YYYY-MM-DD');

export function scheduleRoutes(ctx: AppContext, router: Router, auth: RequestHandler) {
  mount(router, auth, API_ROUTES.proposeAlSchedule, async (req, res) => {
    const user = req.user!;
    const id = uuidParam(req.params.id);
    const b = parse(z.object({ startDate: date, endDate: date, location: z.string().trim().min(2).max(300), mode: z.enum(['luring', 'daring', 'hibrida']) }), req.body);
    if (b.endDate < b.startDate) throw badRequest('Tanggal selesai tidak boleh sebelum tanggal mulai');
    const out = await withTransaction(async (c) => {
      const sub = await loadSubmissionForUser(c, user, id, { forUpdate: true });
      assertFlow('propose_al_schedule', stateOf(sub));
      const v = (await q1<{ v: number }>(c, 'SELECT coalesce(max(version),0)+1 AS v FROM al_schedules WHERE submission_id=$1', [id]))!.v;
      const s = await q1(c, `INSERT INTO al_schedules (submission_id, version, proposed_by, start_date, end_date, location, mode) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [id, v, user.id, b.startDate, b.endDate, b.location, b.mode]);
      await c.query(`UPDATE submissions SET al_schedule_status='proposed', updated_at=now() WHERE id=$1`, [id]);
      const ev = await recordAuditEvent(c, { aggregateType: 'al_schedule', aggregateId: s!.id, submissionId: id, kind: 'ALScheduleProposed', version: v, snapshot: s!, actor: { uid: user.id, role: user.role } });
      return { s: s!, ev };
    }, ctx.pool);
    res.status(201).json(envelope(camel(out.s), { audit: auditReceipt([out.ev]) }));
  });

  mount(router, auth, API_ROUTES.decideAlSchedule, async (req, res) => {
    const user = req.user!;
    const scheduleId = uuidParam(req.params.scheduleId);
    const b = parse(z.object({ result: z.enum(['approved', 'rejected']), notes: z.string().trim().max(5000).optional() }), req.body);
    if (b.result === 'rejected' && !b.notes) throw badRequest('Catatan wajib diisi saat menolak jadwal');
    const pre = await q1(ctx.pool, 'SELECT submission_id FROM al_schedules WHERE id=$1', [scheduleId]);
    if (!pre) throw notFound('Jadwal tidak ditemukan');
    const out = await withTransaction(async (c) => {
      const sub = await loadSubmissionForUser(c, user, pre.submission_id, { forUpdate: true });
      assertFlow('decide_al_schedule', stateOf(sub));
      const cur = await q1(c, 'SELECT * FROM al_schedules WHERE id=$1 FOR UPDATE', [scheduleId]);
      if (!cur || cur.status !== 'proposed') throw conflict('Jadwal ini tidak menunggu keputusan');
      const s = await q1(c, `UPDATE al_schedules SET status=$2, decided_by=$3, decided_at=now(), notes=$4 WHERE id=$1 RETURNING *`, [scheduleId, b.result, user.id, b.notes ?? null]);
      await c.query(`UPDATE submissions SET al_schedule_status=$2, updated_at=now() WHERE id=$1`, [sub.id, b.result]);
      const ev = await recordAuditEvent(c, {
        aggregateType: 'al_schedule', aggregateId: scheduleId, submissionId: sub.id, kind: b.result === 'approved' ? 'ALScheduleApproved' : 'ALScheduleRejected',
        version: s!.version, snapshot: s!, actor: { uid: user.id, role: user.role },
      });
      return { s: s!, ev };
    }, ctx.pool);
    res.json(envelope(camel(out.s), { audit: auditReceipt([out.ev]) }));
  });
}
