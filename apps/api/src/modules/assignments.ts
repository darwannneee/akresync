import type { RequestHandler, Router } from 'express';
import { z } from 'zod';
import { API_ROUTES, CHAIN_FUNCTIONS, type AssessorOfferPayload, type AssignmentResponsePayload } from '@akreditasi/shared';
import { sha256Hex } from '@akreditasi/shared/node';
import { loadSubmissionForUser } from '../auth/rbac.js';
import type { AppContext } from '../context.js';
import { auditReceipt, recordAuditEvent } from '../db/outbox.js';
import { q, q1, withTransaction } from '../db/pool.js';
import { badRequest, conflict, forbidden, notFound } from '../errors.js';
import { assertFlow, stateOf } from '../flow.js';
import { envelope, mount, parse, requestIdFrom, uuidParam } from '../lib/http.js';
import { executeChainAction, findReplay } from './chainAction.js';
import { assertAuditCommitted, camel } from './common.js';

export function assignmentRoutes(ctx: AppContext, router: Router, auth: RequestHandler) {
  mount(router, auth, API_ROUTES.offerAssessors, async (req, res) => {
    const user = req.user!;
    const id = uuidParam(req.params.id);
    const b = parse(z.object({ assessor1Id: z.string().uuid(), assessor2Id: z.string().uuid(), leadAssessorId: z.string().uuid() }), req.body);
    if (b.assessor1Id === b.assessor2Id) throw badRequest('Dua asesor harus berbeda');
    if (![b.assessor1Id, b.assessor2Id].includes(b.leadAssessorId)) throw badRequest('Ketua asesor harus salah satu dari dua asesor');
    const requestId = requestIdFrom(req);
    const replay = await findReplay(ctx, requestId, user.id, id);
    if (replay) return void res.json(envelope({ submissionId: id, replayed: true }, { chain: replay.chain }));
    const sub = await loadSubmissionForUser(ctx.pool, user, id);
    assertFlow('offer_assessors', stateOf(sub));
    const valid = await q(ctx.pool, `SELECT id FROM users WHERE id = ANY($1::uuid[]) AND role='asesor' AND is_active`, [[b.assessor1Id, b.assessor2Id]]);
    if (valid.length !== 2) throw badRequest('Asesor tidak ditemukan atau tidak aktif');
    const prev = await q1(ctx.pool, `SELECT offer_no, chain_seq, rejection_reviewed_at, status FROM assessor_offers WHERE submission_id=$1 ORDER BY offer_no DESC LIMIT 1`, [id]);
    let replaces: number | null = null;
    if (sub.ak_status === 'offer_rejected') {
      if (!prev || prev.status !== 'rejected') throw conflict('Tidak ada penawaran yang ditolak');
      if (!prev.rejection_reviewed_at) throw conflict('Penolakan penugasan harus ditinjau (rejection-review) sebelum penawaran ulang');
      await assertAuditCommitted(ctx.pool, id, 'AssignmentRejectionReviewed', 'Tinjauan penolakan');
      replaces = prev.chain_seq;
    } else {
      await assertAuditCommitted(ctx.pool, id, 'PaymentVerified', 'Verifikasi pembayaran');
    }
    const payload: AssessorOfferPayload = { offerNo: (prev?.offer_no ?? 0) + 1, assessorUids: [b.assessor1Id, b.assessor2Id], leadUid: b.leadAssessorId, replacesOfferSeq: replaces };
    const r = await executeChainAction(ctx, { userId: user.id, submissionId: id, recordType: 'ASSESSOR_OFFER', fn: CHAIN_FUNCTIONS.OfferAssessorPair, requestId, args: [requestId, id, JSON.stringify(payload)], payload });
    const offer = await q1(ctx.pool, 'SELECT * FROM assessor_offers WHERE submission_id=$1 AND offer_no=$2', [id, payload.offerNo]);
    res.status(201).json(envelope(offer ? camel(offer) : { offerNo: payload.offerNo }, { chain: r.chain }));
  });

  mount(router, auth, API_ROUTES.respondOffer, async (req, res) => {
    const user = req.user!;
    const offerId = uuidParam(req.params.offerId);
    const b = parse(z.object({ response: z.string().transform((v) => v.toUpperCase()).pipe(z.enum(['ACCEPT', 'REJECT'])), reason: z.string().trim().max(5000).optional() }), req.body);
    if (b.response === 'REJECT' && !b.reason) throw badRequest('Alasan wajib diisi saat menolak penugasan');
    const offer = await q1(ctx.pool, 'SELECT * FROM assessor_offers WHERE id=$1', [offerId]);
    if (!offer) throw notFound('Penawaran tidak ditemukan');
    const sub = await loadSubmissionForUser(ctx.pool, user, offer.submission_id);
    const requestId = requestIdFrom(req);
    const replay = await findReplay(ctx, requestId, user.id, sub.id);
    if (replay) return void res.json(envelope({ offerId, replayed: true }, { chain: replay.chain }));
    assertFlow('respond_offer', stateOf(sub));
    if (offer.status !== 'offered') throw conflict('Penawaran ini tidak lagi aktif');
    let col: string;
    if (user.role === 'upps') col = 'upps_response';
    else if (user.id === offer.assessor1_id) col = 'assessor1_response';
    else if (user.id === offer.assessor2_id) col = 'assessor2_response';
    else throw forbidden('Anda bukan asesor pada penawaran ini');
    if (offer[col]) throw conflict('Anda sudah memberikan respons untuk penawaran ini');
    const payload: AssignmentResponsePayload = {
      offerSeq: offer.chain_seq,
      responderRole: user.role === 'upps' ? 'upps' : 'asesor',
      response: b.response,
      reasonSha256: b.reason ? sha256Hex(b.reason.trim()) : null,
    };
    const r = await executeChainAction(ctx, {
      userId: user.id, submissionId: sub.id, recordType: 'ASSIGNMENT_RESPONSE', fn: CHAIN_FUNCTIONS.RespondAssignment, requestId,
      args: [requestId, sub.id, JSON.stringify(payload)], payload, offChain: { reason: b.reason?.trim() ?? null, offerId },
    });
    const after = await q1(ctx.pool, 'SELECT * FROM assessor_offers WHERE id=$1', [offerId]);
    res.status(201).json(envelope(camel(after!), { chain: r.chain }));
  });

  mount(router, auth, API_ROUTES.reviewOfferRejection, async (req, res) => {
    const user = req.user!;
    const offerId = uuidParam(req.params.offerId);
    const b = parse(z.object({ notes: z.string().trim().min(1).max(5000) }), req.body);
    const pre = await q1(ctx.pool, 'SELECT submission_id FROM assessor_offers WHERE id=$1', [offerId]);
    if (!pre) throw notFound('Penawaran tidak ditemukan');
    const out = await withTransaction(async (c) => {
      const sub = await loadSubmissionForUser(c, user, pre.submission_id, { forUpdate: true });
      assertFlow('review_offer_rejection', stateOf(sub));
      const offer = await q1(c, 'SELECT * FROM assessor_offers WHERE id=$1 FOR UPDATE', [offerId]);
      if (!offer || offer.status !== 'rejected') throw conflict('Penawaran ini tidak berstatus ditolak');
      if (offer.rejection_reviewed_at) throw conflict('Penolakan ini sudah ditinjau');
      const o = await q1(c, `UPDATE assessor_offers SET rejection_review_notes=$2, rejection_reviewed_by=$3, rejection_reviewed_at=now(), version=version+1 WHERE id=$1 RETURNING *`, [offerId, b.notes, user.id]);
      const ev = await recordAuditEvent(c, { aggregateType: 'assessor_offer', aggregateId: offerId, submissionId: sub.id, kind: 'AssignmentRejectionReviewed', version: o!.version, snapshot: o!, actor: { uid: user.id, role: user.role } });
      return { o: o!, ev };
    }, ctx.pool);
    res.json(envelope(camel(out.o), { audit: auditReceipt([out.ev]) }));
  });
}
