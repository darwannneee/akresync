import { processMessage, type Deps, type Outcome } from './handler.js';

export interface SweepDeps {
  /** Peristiwa yang belum tercatat: `failed` karena galat sementara (termasuk data lama) atau `pending` lama tanpa kemajuan. */
  listRetryable(limit: number): Promise<{ eventId: string; payload: unknown }[]>;
  /** Kembalikan baris `failed` menjadi `pending` sebelum dicoba lagi. */
  reopen(eventId: string): Promise<void>;
}

/** Pola galat permanen dalam bentuk yang dipakai SQL (`!~`), selaras dengan PERMANENT di handler. */
export const PERMANENT_SQL_PATTERN = `(AUDIT_CONFLICT|INVALID_ARGUMENT|FORBIDDEN):|pesan ditolak`;

export interface SweepResult { tried: number; committed: number; retry: number; failed: number }

/**
 * Satu putaran pemroses ulang. Setiap peristiwa dikirim ulang lewat jalur yang sama dengan consumer
 * (validasi hash, RecordAudit idempoten per eventId). Hanya satu percobaan per peristiwa per putaran.
 */
export async function sweepOnce(deps: Deps, sweep: SweepDeps, limit = 20): Promise<SweepResult> {
  const rows = await sweep.listRetryable(limit);
  const res: SweepResult = { tried: 0, committed: 0, retry: 0, failed: 0 };
  const single: Deps = { ...deps, backoffMs: [] };
  for (const row of rows) {
    if (deps.isStopping?.()) break;
    res.tried++;
    await sweep.reopen(row.eventId);
    let outcome: Outcome;
    try {
      outcome = await processMessage(single, row.eventId, Buffer.from(JSON.stringify(row.payload)));
    } catch (err) {
      deps.log?.warn({ eventId: row.eventId, err: String(err) }, 'pemroses ulang audit gagal menulis status');
      res.retry++;
      continue;
    }
    if (outcome === 'committed' || outcome === 'already_committed') res.committed++;
    else if (outcome === 'retry') res.retry++;
    else res.failed++;
  }
  return res;
}
