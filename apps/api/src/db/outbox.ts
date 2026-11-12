import { randomUUID } from 'node:crypto';
import type { AggregateType, AppRole, AuditEvent, AuditEventKind, AuditReceipt, OutboxPayload } from '@akreditasi/shared';
import { hashSnapshot } from '@akreditasi/shared/node';
import type { Queryable } from './pool.js';

function stripNulls(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripNulls);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, x]) => x !== null).map(([k, x]) => [k, stripNulls(x)]));
  }
  return v;
}

export interface RecordAuditInput {
  aggregateType: AggregateType;
  aggregateId: string;
  submissionId: string | null;
  kind: AuditEventKind;
  version: number;
  snapshot: Record<string, unknown>;
  actor: { uid: string; role: AppRole };
}

/**
 * Menulis outbox (insert-only) + audit_status(pending) di transaksi SQL yang sama dengan penulisan domain.
 * `client` HARUS client di dalam transaksi pemanggil; fungsi ini tidak membuka/menutup transaksi.
 */
export async function recordAuditEvent(client: Queryable, input: RecordAuditInput): Promise<string> {
  const eventId = randomUUID();
  // Debezium Outbox Event Router membuang field bernilai null saat meng-expand payload jsonb; buang di sumber
  // agar payloadSha256 sama di outbox, Kafka, worker, dan verifikator.
  const snapshot = stripNulls(JSON.parse(JSON.stringify(input.snapshot))) as Record<string, unknown>;
  const event: AuditEvent = {
    eventId,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    submissionId: input.submissionId,
    kind: input.kind,
    version: input.version,
    payloadSha256: hashSnapshot(snapshot),
    actorUid: input.actor.uid,
    actorRole: input.actor.role,
    occurredAt: new Date().toISOString(),
  };
  const payload: OutboxPayload = { event, snapshot };
  await client.query(
    `INSERT INTO outbox (id, aggregatetype, aggregateid, type, submission_id, payload)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
    [eventId, event.aggregateType, event.aggregateId, event.kind, event.submissionId, JSON.stringify(payload)],
  );
  await client.query(`INSERT INTO audit_status (event_id, status) VALUES ($1,'pending')`, [eventId]);
  return eventId;
}

export const auditReceipt = (eventIds: string[]): AuditReceipt => ({ eventIds, status: 'pending' });
