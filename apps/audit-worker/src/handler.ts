import { SHA256_HEX, type AuditEvent, type OutboxPayload } from '@akreditasi/shared';
import { AUDIT_EVENT_KINDS, AGGREGATE_TYPES, APP_ROLES } from '@akreditasi/shared';
import { hashSnapshot } from '@akreditasi/shared/node';
import { z } from 'zod';

const eventSchema = z.object({
  eventId: z.string().uuid(),
  aggregateType: z.enum(AGGREGATE_TYPES),
  aggregateId: z.string().min(1),
  submissionId: z.string().nullable(),
  kind: z.enum(AUDIT_EVENT_KINDS),
  version: z.number().int(),
  payloadSha256: z.string().regex(SHA256_HEX),
  actorUid: z.string().min(1),
  actorRole: z.enum(APP_ROLES),
  occurredAt: z.string().min(1),
});
const payloadSchema = z.object({ event: eventSchema, snapshot: z.record(z.unknown()) });

export class InvalidMessageError extends Error {
  constructor(
    message: string,
    public readonly eventId: string | null = null,
  ) {
    super(message);
  }
}

/** Parse + validasi pesan Kafka (nilai = payload outbox yang sudah di-expand Debezium). */
export function parseOutboxMessage(value: Buffer | string | null): OutboxPayload {
  if (!value) throw new InvalidMessageError('pesan kosong');
  let raw: unknown;
  try {
    raw = JSON.parse(value.toString());
    if (typeof raw === 'string') raw = JSON.parse(raw); // payload belum di-expand
  } catch {
    throw new InvalidMessageError('JSON tidak valid');
  }
  const eventIdGuess = (raw as { event?: { eventId?: unknown } } | null)?.event?.eventId;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const id = typeof eventIdGuess === 'string' && UUID.test(eventIdGuess) ? eventIdGuess : null;
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) throw new InvalidMessageError(`bentuk AuditEvent tidak valid: ${parsed.error.issues[0]?.path.join('.')}`, id);
  const p = parsed.data as OutboxPayload;
  if (hashSnapshot(p.snapshot) !== p.event.payloadSha256) throw new InvalidMessageError('payloadSha256 tidak sama dengan hash snapshot', p.event.eventId);
  return p;
}

export interface SubmitOutcome {
  txId: string;
  blockNumber: string;
}

export interface Deps {
  /** Kirim RecordAudit, tunggu VALID. Melempar error bila gagal. */
  submitAudit(event: AuditEvent): Promise<SubmitOutcome>;
  getStatus(eventId: string): Promise<'pending' | 'committed' | 'failed' | null>;
  recordAttempt(eventId: string, attempts: number, error: string): Promise<void>;
  markCommitted(eventId: string, o: SubmitOutcome, attempts: number): Promise<void>;
  markFailed(eventId: string, error: string, attempts: number): Promise<void>;
  publishDlq(key: string | null, value: Buffer | string | null, error: string): Promise<void>;
  sleep(ms: number): Promise<void>;
  backoffMs: number[];
  /** Tanda berhenti (shutdown): sisa percobaan dilewati agar proses dapat selesai. */
  isStopping?: () => boolean;
  log?: { info: (o: object, m: string) => void; warn: (o: object, m: string) => void };
}

/**
 * `retry`: galat sementara (jaringan Fabric, timeout, layanan tidak tersedia). Status tetap `pending`,
 * offset JANGAN di-commit; pesan dicoba lagi oleh pemanggil atau oleh pemroses ulang berkala.
 */
export type Outcome = 'committed' | 'already_committed' | 'failed' | 'retry';

/** Galat permanen: mengulang tidak akan membantu (aturan chaincode / data tidak sah). */
export const PERMANENT = /\b(AUDIT_CONFLICT|INVALID_ARGUMENT|FORBIDDEN):/;
/** Galat sementara: layanan atau jaringan belum siap; aman dicoba ulang kapan saja (RecordAudit idempoten per eventId). */
export const TRANSIENT = /UNAVAILABLE|DEADLINE_EXCEEDED|CANCELLED|ABORTED|ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EPIPE|timeout|timed out|No connection|Failed to connect|connect ECONN|socket|network|peer|endorse|orderer|MVCC|not available|unavailable|tidak VALID/i;

export const classifyError = (text: string): 'permanent' | 'transient' | 'unknown' =>
  PERMANENT.test(text) ? 'permanent' : TRANSIENT.test(text) ? 'transient' : 'unknown';

/** Dilempar agar offset tidak di-commit; pesan yang sama diproses lagi setelah jeda. */
export class RetryLaterError extends Error {
  constructor(
    public readonly eventId: string,
    public readonly reason: string,
  ) {
    super(`audit ${eventId} belum tercatat, dicoba lagi: ${reason}`);
    this.name = 'RetryLaterError';
  }
}

function errText(err: unknown): string {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  const visit = (e: unknown) => {
    if (!e || typeof e !== 'object' || seen.has(e)) return;
    seen.add(e);
    const o = e as { message?: unknown; details?: unknown; cause?: unknown };
    if (typeof o.message === 'string') parts.push(o.message);
    if (Array.isArray(o.details)) o.details.forEach(visit);
    visit(o.cause);
  };
  visit(err);
  return parts.join(' | ').slice(0, 1000);
}

/**
 * Proses satu pesan. Mengembalikan setelah hasil akhir pasti (committed / failed+DLQ),
 * sehingga pemanggil boleh meng-commit offset; `retry` berarti belum pasti (offset jangan di-commit). Melempar hanya bila DB/DLQ sendiri gagal
 * (offset JANGAN di-commit → pesan diproses ulang).
 */
export async function processMessage(deps: Deps, key: string | null, value: Buffer | string | null): Promise<Outcome> {
  let payload: OutboxPayload;
  try {
    payload = parseOutboxMessage(value);
  } catch (err) {
    const e = err as InvalidMessageError;
    const msg = `pesan ditolak: ${e.message}`;
    if (e.eventId) await deps.markFailed(e.eventId, msg, 0);
    await deps.publishDlq(key ?? e.eventId, value, msg);
    deps.log?.warn({ eventId: e.eventId }, msg);
    return 'failed';
  }
  const { event } = payload;
  if ((await deps.getStatus(event.eventId)) === 'committed') return 'already_committed';

  let attempts = 0;
  let lastError = '';
  let kind: 'permanent' | 'transient' | 'unknown' = 'unknown';
  const maxAttempts = deps.backoffMs.length + 1;
  while (attempts < maxAttempts) {
    attempts++;
    let outcome: SubmitOutcome | undefined;
    try {
      outcome = await deps.submitAudit(event);
    } catch (err) {
      lastError = errText(err);
      kind = classifyError(lastError);
      if (kind === 'permanent') break; // AUDIT_CONFLICT dll: tidak ada gunanya mencoba ulang
      await deps.recordAttempt(event.eventId, attempts, lastError);
      const wait = deps.backoffMs[attempts - 1];
      if (wait === undefined || deps.isStopping?.()) break;
      await deps.sleep(wait);
      continue;
    }
    // VALID: kegagalan menulis status DB melempar ke pemanggil (offset tidak di-commit; pemrosesan ulang idempoten).
    await deps.markCommitted(event.eventId, outcome, attempts);
    deps.log?.info({ eventId: event.eventId, txId: outcome.txId, attempts }, 'audit tercatat');
    return 'committed';
  }
  if (kind === 'transient') {
    // Status tetap pending (last_error terisi): tampil sebagai "dicoba ulang otomatis". Offset tidak di-commit.
    deps.log?.warn({ eventId: event.eventId, attempts }, 'audit belum berhasil (galat sementara); akan dicoba lagi');
    return 'retry';
  }
  await deps.markFailed(event.eventId, lastError, attempts);
  await deps.publishDlq(event.eventId, value, lastError);
  return 'failed';
}

export interface MessageLike {
  topic: string;
  partition: number;
  key: Buffer | null;
  value: Buffer | null;
  offset: string;
}

/** Bungkus processMessage + commit offset manual SETELAH hasil akhir (VALID atau DLQ). */
export function makeEachMessage(deps: Deps, commitOffsets: (o: { topic: string; partition: number; offset: string }[]) => Promise<void>) {
  return async (m: MessageLike): Promise<Outcome> => {
    const outcome = await processMessage(deps, m.key?.toString() ?? null, m.value);
    if (outcome === 'retry') {
      const id = parseOutboxMessage(m.value).event.eventId;
      throw new RetryLaterError(id, 'galat sementara pada layanan ledger');
    }
    await commitOffsets([{ topic: m.topic, partition: m.partition, offset: (BigInt(m.offset) + 1n).toString() }]);
    return outcome;
  };
}
