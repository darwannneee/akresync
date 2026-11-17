import { processMessage, type Deps, type Outcome } from './handler.js';

export interface SweepDeps {
  /** Peristiwa yang belum tercatat: `failed` karena galat sementara (termasuk data lama) atau `pending` lama tanpa kemajuan. */
  listRetryable(limit: number): Promise<{ eventId: string; payload: unknown }[]>;
  /** Kembalikan baris `failed` menjadi `pending` sebelum dicoba lagi. */
  reopen(eventId: string): Promise<void>;
}

/** Pola galat permanen dalam bentuk yang dipakai SQL (`!~`), selaras dengan PERMANENT di handler. */
export const PERMANENT_SQL_PATTERN = `(AUDIT_CONFLICT|INVALID_ARGUMENT|FORBIDDEN):|pesan ditolak`;

export interface SweepResult { tried: number; committed: number; retry: number; failed: number; skipped: number }

/**
 * Satu putaran pemroses ulang. Setiap peristiwa dikirim ulang lewat jalur yang sama dengan consumer
 * (validasi hash, RecordAudit idempoten per eventId). Hanya satu percobaan per peristiwa per putaran.
 */
export async function sweepOnce(deps: Deps, sweep: SweepDeps, limit = 20): Promise<SweepResult> {
  const rows = await sweep.listRetryable(limit);
  const res: SweepResult = { tried: 0, committed: 0, retry: 0, failed: 0, skipped: 0 };
  // Pemroses ulang tidak mempublikasikan DLQ: kegagalan cukup tercatat sebagai status `failed` + last_error
  // (pesan Kafka asli sudah ber-DLQ oleh konsumen bila memang ditolak), sehingga tidak ada DLQ ganda.
  const single: Deps = { ...deps, backoffMs: [], publishDlq: async () => undefined };
  for (const row of rows) {
    if (deps.isStopping?.()) break;
    const work = async (): Promise<Outcome> => {
      await sweep.reopen(row.eventId);
      return processMessage(single, row.eventId, Buffer.from(JSON.stringify(row.payload)));
    };
    let outcome: Outcome;
    try {
      // Lewati peristiwa yang sedang diproses konsumen (kunci per eventId).
      const locked = deps.withEventLock ? await deps.withEventLock(row.eventId, work) : { acquired: true as const, value: await work() };
      if (!locked.acquired) {
        res.skipped++;
        continue;
      }
      outcome = locked.value;
    } catch (err) {
      res.tried++;
      deps.log?.warn({ eventId: row.eventId, err: String(err) }, 'pemroses ulang audit gagal menulis status');
      res.retry++;
      continue;
    }
    res.tried++;
    if (outcome === 'committed' || outcome === 'already_committed') res.committed++;
    else if (outcome === 'retry') res.retry++;
    else res.failed++;
  }
  return res;
}
