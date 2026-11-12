import { CHAIN_FUNCTIONS, type FormalRecord } from '@akreditasi/shared';
import type { AppContext } from '../context.js';
import { q, withTransaction } from '../db/pool.js';
import { commitRecordRow } from '../modules/chainAction.js';
import { logger } from '../logger.js';

export interface ReconcileResult {
  completed: number;
  failed: number;
  skipped: number;
}

/**
 * Cari formal_records `pending_chain` lebih tua dari `pendingAfterMs`, tanya chain via requestId:
 * ada → lengkapi proyeksi; tidak ada (NOT_FOUND) dan sudah melewati 3x ambang → tandai failed.
 */
export async function reconcileOnce(ctx: AppContext, now = Date.now()): Promise<ReconcileResult> {
  const pendingAfter = ctx.config.RECONCILER_PENDING_AFTER_MS;
  const rows = await q<{ id: string; submission_id: string; actor_user_id: string | null; request_id: string; created_at: Date }>(
    ctx.pool,
    `SELECT id, submission_id, actor_user_id, request_id, created_at FROM formal_records
     WHERE status='pending_chain' AND created_at < now() - ($1 || ' milliseconds')::interval ORDER BY created_at LIMIT 50`,
    [String(pendingAfter)],
  );
  const res: ReconcileResult = { completed: 0, failed: 0, skipped: 0 };
  for (const row of rows) {
    try {
      const record = await ctx.chain.evaluate<FormalRecord>(row.actor_user_id, CHAIN_FUNCTIONS.GetRecordByRequest, [row.request_id]);
      if (!record || !record.recordKey) throw Object.assign(new Error('kosong'), { code: 'NOT_FOUND' });
      await withTransaction(async (c) => {
        await commitRecordRow(c, { id: row.id, submissionId: row.submission_id, userId: row.actor_user_id, record, txId: record.txId, blockNumber: null, bytes: Buffer.byteLength(JSON.stringify(record)) });
      }, ctx.pool);
      res.completed++;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'NOT_FOUND') {
        if (now - row.created_at.getTime() > pendingAfter * 3) {
          await ctx.pool.query(`UPDATE formal_records SET status='failed', error='Tidak ditemukan di chain setelah batas waktu (rekonsiliasi)' WHERE id=$1 AND status='pending_chain'`, [row.id]);
          res.failed++;
        } else res.skipped++;
      } else {
        logger.warn({ err, requestId: row.request_id }, 'rekonsiliasi: chain tidak terjangkau');
        res.skipped++;
      }
    }
  }
  return res;
}

export function startReconciler(ctx: AppContext): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    reconcileOnce(ctx)
      .then((r) => {
        if (r.completed || r.failed) logger.info(r, 'rekonsiliasi selesai');
      })
      .catch((err) => logger.error({ err }, 'rekonsiliasi gagal'))
      .finally(() => (running = false));
  }, ctx.config.RECONCILER_INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
}
