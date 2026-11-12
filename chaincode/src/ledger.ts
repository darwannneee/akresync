import type { ChaincodeStub } from 'fabric-shim';
import { canonicalJson, RECORD_TYPES, type FormalRecord, type RecordType } from '@akreditasi/shared';
import { fail } from './errors';
import { KEY, recordKey, seqKey } from './keys';

const decoder = new TextDecoder();

export function decode(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

export async function getJson<T>(stub: ChaincodeStub, key: string): Promise<T | null> {
  const bytes = await stub.getState(key);
  if (!bytes || bytes.length === 0) return null;
  return JSON.parse(decode(bytes)) as T;
}

/** Tulis JSON kanonik: byte sama di semua endorser. */
export async function putJson(stub: ChaincodeStub, key: string, value: unknown): Promise<void> {
  await stub.putState(key, Buffer.from(canonicalJson(value), 'utf8'));
}

interface IteratorLike<V> {
  next(): Promise<{ value?: V; done: boolean }>;
  close(): Promise<unknown>;
}

export async function collect<V>(iterator: IteratorLike<V>): Promise<V[]> {
  const out: V[] = [];
  try {
    for (;;) {
      const r = await iterator.next();
      if (r.value !== undefined) out.push(r.value);
      if (r.done) break;
    }
  } finally {
    await iterator.close();
  }
  return out;
}

/** Waktu transaksi (deterministik, sama di semua endorser) sebagai ISO-8601 UTC. */
export function txTimestampIso(stub: ChaincodeStub): string {
  return timestampToIso(stub.getTxTimestamp());
}

export function timestampToIso(ts: { seconds?: unknown; nanos?: number } | null | undefined): string {
  if (!ts) return fail('PRECONDITION_FAILED', 'timestamp transaksi tidak tersedia');
  const seconds = Number(String(ts.seconds ?? 0));
  const nanos = Number(ts.nanos ?? 0);
  return new Date(seconds * 1000 + Math.floor(nanos / 1_000_000)).toISOString();
}

/** Naikkan counter SEQ per pengajuan dan kembalikan nomor urut baru (mulai 1). */
export async function nextSeq(stub: ChaincodeStub, submissionId: string): Promise<number> {
  const key = seqKey(stub, submissionId);
  const current = (await getJson<number>(stub, key)) ?? 0;
  const next = current + 1;
  await putJson(stub, key, next);
  return next;
}

export async function listRecords(stub: ChaincodeStub, type: RecordType, submissionId: string): Promise<FormalRecord[]> {
  const items = await collect(await stub.getStateByPartialCompositeKey(type, [submissionId]));
  const records = items.map((i) => JSON.parse(decode(i.value)) as FormalRecord);
  return records.sort((a, b) => a.seq - b.seq);
}

export async function listAllRecords(stub: ChaincodeStub, submissionId: string): Promise<FormalRecord[]> {
  const all: FormalRecord[] = [];
  for (const t of RECORD_TYPES) all.push(...(await listRecords(stub, t, submissionId)));
  return all.sort((a, b) => a.seq - b.seq);
}

/** Jumlah catatan audit sebuah jenis untuk pengajuan, lewat kunci parsial AUDITIDX. */
export async function countAudit(stub: ChaincodeStub, submissionId: string, kind: string): Promise<number> {
  const items = await collect(await stub.getStateByPartialCompositeKey(KEY.AUDITIDX, [submissionId, kind]));
  return items.length;
}

export { recordKey };
