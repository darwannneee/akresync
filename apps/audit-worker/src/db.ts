import pg from 'pg';
import type { Deps } from './handler.js';

export function dbDeps(pool: pg.Pool): Pick<Deps, 'getStatus' | 'recordAttempt' | 'markCommitted' | 'markFailed'> {
  return {
    async getStatus(eventId) {
      const r = await pool.query<{ status: 'pending' | 'committed' | 'failed' }>('SELECT status FROM audit_status WHERE event_id=$1', [eventId]);
      return r.rows[0]?.status ?? null;
    },
    async recordAttempt(eventId, attempts, error) {
      await pool.query('UPDATE audit_status SET attempts=$2, last_error=$3, updated_at=now() WHERE event_id=$1', [eventId, attempts, error]);
    },
    async markCommitted(eventId, o, attempts) {
      await pool.query(
        `UPDATE audit_status SET status='committed', tx_id=$2, block_number=$3, attempts=$4, last_error=NULL, committed_at=now(), updated_at=now() WHERE event_id=$1`,
        [eventId, o.txId, o.blockNumber, attempts],
      );
    },
    async markFailed(eventId, error, attempts) {
      await pool.query(`UPDATE audit_status SET status='failed', attempts=$3, last_error=$2, updated_at=now() WHERE event_id=$1`, [eventId, error, attempts]);
    },
  };
}
