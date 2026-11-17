import pg from 'pg';
import type { Deps } from './handler.js';
import type { SweepDeps } from './sweep.js';

export function dbDeps(pool: pg.Pool): Pick<Deps, 'getStatus' | 'recordAttempt' | 'markCommitted' | 'markFailed'> {
  return {
    async getStatus(eventId) {
      const r = await pool.query<{ status: 'pending' | 'committed' | 'failed' }>('SELECT status FROM audit_status WHERE event_id=$1', [eventId]);
      return r.rows[0]?.status ?? null;
    },
    async recordAttempt(eventId, attempts, error) {
      await pool.query('UPDATE audit_status SET attempts=GREATEST(attempts + 1, $2), last_error=$3, updated_at=now() WHERE event_id=$1', [eventId, attempts, error]);
    },
    async markCommitted(eventId, o, attempts) {
      await pool.query(
        `UPDATE audit_status SET status='committed', tx_id=$2, block_number=$3, attempts=$4, last_error=NULL, committed_at=now(), updated_at=now() WHERE event_id=$1`,
        [eventId, o.txId, o.blockNumber, attempts],
      );
    },
    async markFailed(eventId, error, attempts) {
      await pool.query(`UPDATE audit_status SET status='failed', attempts=GREATEST(attempts + 1, $3), last_error=$2, updated_at=now() WHERE event_id=$1`, [eventId, error, attempts]);
    },
  };
}

/** Pemroses ulang: baca outbox + audit_status yang belum tercatat. */
export function sweepDeps(pool: pg.Pool, permanentPattern: string, maxAttempts: number, pendingAgeSeconds: number): Pick<SweepDeps, 'listRetryable' | 'reopen'> {
  return {
    async listRetryable(limit) {
      const r = await pool.query<{ id: string; payload: unknown }>(
        `SELECT o.id, o.payload FROM audit_status a JOIN outbox o ON o.id = a.event_id
         WHERE (a.status = 'failed' AND coalesce(a.last_error, '') !~ $1 AND a.attempts < $2)
            OR (a.status = 'pending' AND a.updated_at < now() - make_interval(secs => $3))
         ORDER BY o.created_at LIMIT $4`,
        [permanentPattern, maxAttempts, pendingAgeSeconds, limit],
      );
      return r.rows.map((x) => ({ eventId: x.id, payload: x.payload }));
    },
    async reopen(eventId) {
      await pool.query(`UPDATE audit_status SET status='pending', updated_at=now() WHERE event_id=$1 AND status='failed'`, [eventId]);
    },
  };
}
