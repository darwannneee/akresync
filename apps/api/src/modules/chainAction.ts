import { randomUUID } from 'node:crypto';
import type { ChainReceipt, FormalRecord, RecordType } from '@akreditasi/shared';
import type { AppContext } from '../context.js';
import { dbSafe, q1, toDbKey, withTransaction } from '../db/pool.js';
import { AppError, conflict } from '../errors.js';
import { applyProjection } from './projections.js';
import { logger } from '../logger.js';

export interface ChainActionInput {
  userId: string;
  submissionId: string;
  recordType: RecordType;
  fn: string;
  requestId: string;
  /** Argumen fungsi chaincode (requestId sudah termasuk). */
  args: string[];
  /** Payload yang dikirim (disimpan ke proyeksi sementara sampai catatan chain kembali). */
  payload: unknown;
  offChain?: Record<string, unknown>;
  /** Untuk koreksi: catatan yang dikoreksi. */
  correctsKey?: string;
  correctsVersion?: number;
}

export interface ChainActionResult {
  chain: ChainReceipt;
  record: FormalRecord;
  formalRecordId: string;
  replayed: boolean;
}

interface FrRow {
  id: string;
  submission_id: string;
  record_type: string;
  record_key: string;
  seq: number;
  version: number;
  status: 'pending_chain' | 'committed' | 'failed';
  actor_user_id: string | null;
  tx_id: string | null;
  block_number: string | null;
  payload: any;
}

const receiptFromRow = (r: FrRow): ChainReceipt => ({
  txId: r.tx_id ?? '',
  status: 'VALID',
  blockNumber: r.block_number ?? '0',
  recordKey: r.record_key,
  version: r.version,
});

/** Bila requestId sudah ter-commit untuk aksi yang sama oleh pemanggil yang sama → kembalikan hasil sebelumnya (idempoten). */
export async function findReplay(ctx: AppContext, requestId: string, userId: string, submissionId: string | null): Promise<ChainActionResult | null> {
  const row = await q1<FrRow>(ctx.pool, 'SELECT * FROM formal_records WHERE request_id = $1', [requestId]);
  if (!row) return null;
  if (row.actor_user_id !== userId || (submissionId && row.submission_id !== submissionId)) {
    throw conflict('Idempotency-Key sudah dipakai untuk permintaan lain');
  }
  if (row.status === 'pending_chain') throw conflict('Permintaan dengan Idempotency-Key ini masih diproses; coba lagi sebentar lagi');
  if (row.status === 'failed') return null;
  return { chain: receiptFromRow(row), record: { payload: row.payload, recordKey: row.record_key, version: row.version } as FormalRecord, formalRecordId: row.id, replayed: true };
}

/** Kegagalan pasti (ditolak chaincode / tidak VALID) vs tak pasti (jaringan/timeout → serahkan ke reconciler). */
const isDefinitiveFailure = (e: AppError) => e.code !== 'CHAIN_UNAVAILABLE';

/**
 * Aksi kelas C: catat formal_records(pending_chain) → kirim ke chain dengan identitas pemanggil →
 * hanya bila VALID: update formal_records + proyeksi dalam satu transaksi SQL.
 */
export async function executeChainAction(ctx: AppContext, input: ChainActionInput): Promise<ChainActionResult> {
  const replay = await findReplay(ctx, input.requestId, input.userId, input.submissionId);
  if (replay) return replay;

  const placeholderKey = `PENDING~${input.requestId}`;
  const rowId = randomUUID();
  const upsertPending = await ctx.pool.query<{ id: string }>(
    `INSERT INTO formal_records (id, submission_id, record_type, record_key, seq, version, request_id, actor_user_id, payload, payload_bytes, status, off_chain)
     VALUES ($1,$2,$3,$4,0,0,$5,$6,$7::jsonb,0,'pending_chain',$8::jsonb)
     ON CONFLICT (request_id) DO UPDATE SET status='pending_chain', error=NULL, payload=EXCLUDED.payload, off_chain=EXCLUDED.off_chain
       WHERE formal_records.status = 'failed'
     RETURNING id`,
    [rowId, input.submissionId, input.recordType, placeholderKey, input.requestId, input.userId, JSON.stringify(dbSafe(input.payload)), JSON.stringify(dbSafe(input.offChain ?? {}))],
  );
  const id = upsertPending.rows[0]?.id;
  if (!id) throw conflict('Idempotency-Key ini sedang diproses');

  let submit;
  try {
    submit = await ctx.chain.submit(input.userId, input.fn, input.args);
    if (!submit.record) throw new AppError(502, 'CHAIN_BAD_RESPONSE', 'Chaincode tidak mengembalikan catatan formal');
  } catch (err) {
    const e = err instanceof AppError ? err : new AppError(502, 'CHAIN_UNAVAILABLE', String((err as Error).message));
    if (isDefinitiveFailure(e)) {
      await ctx.pool.query(`UPDATE formal_records SET status='failed', error=$2 WHERE id=$1`, [id, `${e.code}: ${e.message}`.slice(0, 500)]);
    }
    throw e;
  }

  const record = submit.record;
  try {
    await withTransaction(async (client) => {
      await commitRecordRow(client, { id, submissionId: input.submissionId, userId: input.userId, record, txId: submit.txId, blockNumber: submit.blockNumber, bytes: submit.recordBytes });
    }, ctx.pool);
  } catch (err) {
    logger.error({ err, txId: submit.txId, requestId: input.requestId }, 'transaksi VALID tetapi proyeksi gagal; reconciler akan melengkapi');
    throw new AppError(500, 'PROJECTION_PENDING', `Transaksi chain berhasil (${submit.txId}) tetapi proyeksi basis data tertunda dan akan dilengkapi otomatis`, {
      txId: submit.txId,
      requestId: input.requestId,
    });
  }
  return {
    chain: { txId: submit.txId, status: 'VALID', blockNumber: submit.blockNumber, recordKey: record.recordKey, version: record.version },
    record,
    formalRecordId: id,
    replayed: false,
  };
}

/** Dipakai bersama oleh jalur normal dan reconciler. Harus dipanggil di dalam transaksi. */
export async function commitRecordRow(
  client: Parameters<typeof applyProjection>[0],
  p: { id: string; submissionId: string; userId: string | null; record: FormalRecord; txId: string; blockNumber: string | null; bytes: number },
): Promise<void> {
  await client.query(
    `UPDATE formal_records SET record_key=$2, seq=$3, version=$4, payload=$5::jsonb, payload_bytes=$6, tx_id=$7, block_number=$8,
       status='committed', error=NULL, committed_at=now() WHERE id=$1`,
    [p.id, toDbKey(p.record.recordKey), p.record.seq, p.record.version, JSON.stringify(dbSafe(p.record.payload)), p.bytes, p.txId, p.blockNumber],
  );
  await applyProjection(client, { submissionId: p.submissionId, actorUserId: p.userId, record: p.record });
}
