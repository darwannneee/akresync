import type { RequestHandler, Router } from 'express';
import { z } from 'zod';
import { API_ROUTES, CHAIN_FUNCTIONS, NON_CORRECTABLE_RECORD_TYPES, type RecordType } from '@akreditasi/shared';
import { loadSubmissionForUser } from '../auth/rbac.js';
import type { AppContext } from '../context.js';
import { sha256Hex } from '@akreditasi/shared/node';
import { fromDbKey, q, q1 } from '../db/pool.js';
import { AppError, badRequest, notFound } from '../errors.js';
import { envelope, mount, parse, requestIdFrom, uuidParam } from '../lib/http.js';
import { executeChainAction, findReplay } from './chainAction.js';

/** Payload dari proyeksi DB memakai pengganti NUL pada kunci catatan; kembalikan ke bentuk chain sebelum dikirim. */
function denormalizeKeys(v: unknown): unknown {
  if (typeof v === 'string') return fromDbKey(v);
  if (Array.isArray(v)) return v.map(denormalizeKeys);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, denormalizeKeys(x)]));
  return v;
}

/**
 * Catatan bermuatan hash teks: pengguna mengoreksi TEKS, hash dihitung di server.
 * Hasilnya muatan baru + isi off-chain yang menyertai versi koreksi. Teks yang tidak dikirim diteruskan dari versi sebelumnya.
 */
export function applyTextCorrection(
  type: string,
  payload: Record<string, unknown>,
  input: { notes?: string | null; responseReason?: string | null },
  prev: { version: number; offChain: Record<string, any> },
): { payload: Record<string, unknown>; offChain: Record<string, unknown> } {
  const next = { ...payload };
  const pv = prev.offChain ?? {};
  if (type === 'ADMIN_VERIFICATION' || type === 'FINAL_VERIFICATION') {
    const hasText = input.notes !== undefined || pv.notes !== undefined;
    const notes = input.notes !== undefined ? (input.notes?.trim() || null) : ((pv.notes as string | null | undefined) ?? null);
    if (type === 'ADMIN_VERIFICATION' && next.result !== 'APPROVED' && !notes) throw badRequest('Catatan verifikasi wajib diisi untuk hasil perlu perbaikan atau penolakan.');
    if (hasText) next.notesSha256 = notes ? sha256Hex(notes) : null;
    return { payload: next, offChain: hasText ? { notes } : {} };
  }
  if (type === 'ASSIGNMENT_RESPONSE') {
    const before = (prev.version > 1 ? pv.responseReason : pv.reason) as string | null | undefined;
    const hasText = input.responseReason !== undefined || before !== undefined;
    const reason = input.responseReason !== undefined ? (input.responseReason?.trim() || null) : (before ?? null);
    if (next.response === 'REJECT' && hasText && !reason) throw badRequest('Alasan penolakan wajib diisi.');
    if (hasText) next.reasonSha256 = reason ? sha256Hex(reason) : null;
    return { payload: next, offChain: { ...(hasText ? { responseReason: reason } : {}), ...(pv.offerId ? { offerId: pv.offerId } : {}) } };
  }
  return { payload: next, offChain: {} };
}

export function recordRoutes(ctx: AppContext, router: Router, auth: RequestHandler) {
  mount(router, auth, API_ROUTES.correctRecord, async (req, res) => {
    const user = req.user!;
    const row = await q1(ctx.pool, `SELECT * FROM formal_records WHERE id=$1 AND status='committed'`, [uuidParam(req.params.recordId)]);
    if (!row) throw notFound('Catatan formal tidak ditemukan');
    await loadSubmissionForUser(ctx.pool, user, row.submission_id);
    if ((NON_CORRECTABLE_RECORD_TYPES as readonly string[]).includes(row.record_type)) throw badRequest('Catatan jenis ini tidak dapat dikoreksi; lakukan revisi melalui pengajuan ulang');
    const b = parse(
      z.object({
        payload: z.record(z.unknown()),
        notes: z.string().max(5000).nullish().transform((v) => (v === undefined ? undefined : v)),
        responseReason: z.string().max(5000).nullish().transform((v) => (v === undefined ? undefined : v)),
        reason: z.string().trim().min(3).max(2000),
        evidenceRef: z.string().trim().min(1).max(1000),
        expectedVersion: z.number().int().positive(),
      }),
      req.body,
    );
    const requestId = requestIdFrom(req);
    const replay = await findReplay(ctx, requestId, user.id, row.submission_id);
    if (replay) return void res.json(envelope({ recordId: row.id, replayed: true }, { chain: replay.chain }));
    const latest = await q1<{ v: number }>(ctx.pool, `SELECT max(version) AS v FROM formal_records WHERE record_key=$1 AND status='committed'`, [row.record_key]);
    if (b.expectedVersion !== latest?.v) throw new AppError(409, 'VERSION_CONFLICT', `Versi catatan sudah berubah (sekarang v${latest?.v}); muat ulang sebelum mengoreksi`, { currentVersion: latest?.v });
    const latestRow = await q1(ctx.pool, `SELECT version, off_chain FROM formal_records WHERE record_key=$1 AND status='committed' ORDER BY version DESC LIMIT 1`, [row.record_key]);
    const t = applyTextCorrection(row.record_type, b.payload, { notes: b.notes, responseReason: b.responseReason }, { version: latestRow?.version ?? 1, offChain: latestRow?.off_chain ?? {} });
    const r = await executeChainAction(ctx, {
      userId: user.id, submissionId: row.submission_id, recordType: row.record_type as RecordType, fn: CHAIN_FUNCTIONS.CorrectRecord, requestId,
      args: [requestId, fromDbKey(row.record_key), JSON.stringify(denormalizeKeys(t.payload)), b.reason, b.evidenceRef, String(b.expectedVersion)],
      payload: t.payload, offChain: { ...t.offChain, reason: b.reason, evidenceRef: b.evidenceRef },
    });
    res.json(envelope({ recordId: row.id, recordKey: r.chain.recordKey, version: r.chain.version }, { chain: r.chain }));
  });

  mount(router, auth, API_ROUTES.recordHistory, async (req, res) => {
    const user = req.user!;
    const row = await q1(ctx.pool, 'SELECT * FROM formal_records WHERE id=$1', [uuidParam(req.params.recordId)]);
    if (!row || row.status !== 'committed') throw notFound('Catatan formal tidak ditemukan');
    await loadSubmissionForUser(ctx.pool, user, row.submission_id);
    try {
      const history = await ctx.chain.evaluate<unknown[]>(user.id, CHAIN_FUNCTIONS.GetRecordHistory, [fromDbKey(row.record_key)]);
      return void res.json(envelope(history));
    } catch (err) {
      if ((err as { code?: string }).code === 'NOT_FOUND') throw err;
      // Chain tidak terjangkau: tampilkan proyeksi basis data, ditandai sumbernya.
      const versions = await q(ctx.pool, `SELECT tx_id, committed_at, version, payload, off_chain FROM formal_records WHERE record_key=$1 AND status='committed' ORDER BY version DESC`, [row.record_key]);
      res.setHeader('X-History-Source', 'database');
      res.json(envelope(versions.map((v) => ({ txId: v.tx_id, timestamp: v.committed_at, isDelete: false, value: { version: v.version, payload: v.payload, correction: v.off_chain?.reason ? { reason: v.off_chain.reason, evidenceRef: v.off_chain.evidenceRef ?? '' } : null } }))));
    }
  });
}
