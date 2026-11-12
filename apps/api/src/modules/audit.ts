import type { RequestHandler, Router } from 'express';
import { API_ROUTES, CHAIN_FUNCTIONS, type AuditLedgerEntry } from '@akreditasi/shared';
import { hashSnapshot } from '@akreditasi/shared/node';
import { loadSubmissionForUser } from '../auth/rbac.js';
import type { AppContext } from '../context.js';
import { q, q1 } from '../db/pool.js';
import { notFound } from '../errors.js';
import { envelope, mount, uuidParam } from '../lib/http.js';
import { asNumber, camel } from './common.js';

export function auditRoutes(ctx: AppContext, router: Router, auth: RequestHandler) {
  mount(router, auth, API_ROUTES.submissionAudit, async (req, res) => {
    const id = uuidParam(req.params.id);
    await loadSubmissionForUser(ctx.pool, req.user!, id);
    const rows = await q(
      ctx.pool,
      `SELECT o.id AS event_id, o.type AS kind, o.aggregatetype AS aggregate_type, o.aggregateid AS aggregate_id,
              (o.payload->'event'->>'version')::int AS version, o.payload->'event'->>'payloadSha256' AS payload_sha256,
              o.payload->'event'->>'actorRole' AS actor_role, o.payload->'event'->>'occurredAt' AS occurred_at,
              a.status, a.attempts, a.tx_id, a.block_number, a.last_error, a.committed_at
       FROM outbox o JOIN audit_status a ON a.event_id=o.id WHERE o.submission_id=$1 ORDER BY o.created_at`,
      [id],
    );
    res.json(envelope(rows.map((r) => ({ ...camel(r), blockNumber: asNumber(r.block_number) }))));
  });

  mount(router, auth, API_ROUTES.verifyAudit, async (req, res) => {
    const eventId = uuidParam(req.params.eventId);
    const row = await q1(ctx.pool, `SELECT o.id, o.submission_id, o.payload, a.status, a.tx_id FROM outbox o JOIN audit_status a ON a.event_id=o.id WHERE o.id=$1`, [eventId]);
    if (!row) throw notFound('Peristiwa audit tidak ditemukan');
    if (row.submission_id) await loadSubmissionForUser(ctx.pool, req.user!, row.submission_id);
    const recomputed = hashSnapshot(row.payload.snapshot);
    const outboxHash: string = row.payload.event.payloadSha256;
    const base = { eventId, recomputedSha256: recomputed, outboxSha256: outboxHash, status: row.status, txId: row.tx_id as string | null };
    if (row.status !== 'committed') {
      return void res.json(envelope({ ...base, match: false, onChain: false, ledgerSha256: null, message: `Peristiwa belum tercatat on-chain (status: ${row.status})` }));
    }
    const events = await ctx.chain.evaluate<AuditLedgerEntry[] | { events: AuditLedgerEntry[] }>(req.user!.id, CHAIN_FUNCTIONS.GetAuditEvents, [row.submission_id ?? '']);
    const list = Array.isArray(events) ? events : events?.events ?? [];
    const entry = list.find((e) => e.eventId === eventId);
    if (!entry) return void res.json(envelope({ ...base, match: false, onChain: false, ledgerSha256: null, message: 'Peristiwa tidak ditemukan di ledger' }));
    const match = entry.payloadSha256 === recomputed && recomputed === outboxHash;
    res.json(envelope({ ...base, match, onChain: true, ledgerSha256: entry.payloadSha256, txId: entry.txId ?? row.tx_id, message: match ? 'Hash snapshot cocok dengan ledger' : 'Hash snapshot TIDAK cocok dengan ledger (data off-chain berubah)' }));
  });

  mount(router, auth, API_ROUTES.submissionMetrics, async (req, res) => {
    const id = uuidParam(req.params.id);
    await loadSubmissionForUser(ctx.pool, req.user!, id);
    const byType = await q(ctx.pool, `SELECT record_type, count(*)::int AS tx_count, coalesce(sum(payload_bytes),0)::bigint AS bytes_sum, coalesce(avg(payload_bytes),0)::float AS bytes_avg
      FROM formal_records WHERE submission_id=$1 AND status='committed' GROUP BY record_type ORDER BY record_type`, [id]);
    const audit = (await q1(ctx.pool, `SELECT count(*) FILTER (WHERE a.status='committed')::int AS committed, count(*) FILTER (WHERE a.status='pending')::int AS pending, count(*) FILTER (WHERE a.status='failed')::int AS failed,
        coalesce(avg(extract(epoch FROM (a.committed_at - o.created_at))*1000) FILTER (WHERE a.status='committed'),0)::float AS lag_avg_ms,
        coalesce(max(extract(epoch FROM (a.committed_at - o.created_at))*1000) FILTER (WHERE a.status='committed'),0)::float AS lag_max_ms
      FROM outbox o JOIN audit_status a ON a.event_id=o.id WHERE o.submission_id=$1`, [id]))!;
    const flat: Record<string, number> = {};
    let totalTx = 0, totalBytes = 0;
    for (const r of byType) {
      flat[`tx_${r.record_type}`] = r.tx_count;
      flat[`payload_bytes_sum_${r.record_type}`] = Number(r.bytes_sum);
      flat[`payload_bytes_avg_${r.record_type}`] = Math.round(r.bytes_avg);
      totalTx += r.tx_count;
      totalBytes += Number(r.bytes_sum);
    }
    flat.tx_RECORD_total = totalTx;
    flat.tx_AUDIT = audit.committed;
    flat.tx_total = totalTx + audit.committed;
    flat.payload_bytes_sum_total = totalBytes;
    flat.payload_bytes_avg_total = totalTx ? Math.round(totalBytes / totalTx) : 0;
    flat.audit_events_pending = audit.pending;
    flat.audit_events_failed = audit.failed;
    flat.audit_lag_avg_ms = Math.round(audit.lag_avg_ms);
    flat.audit_lag_max_ms = Math.round(audit.lag_max_ms);
    res.json(envelope(flat));
  });
}
