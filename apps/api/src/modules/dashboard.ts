import type { RequestHandler, Router } from 'express';
import { API_ROUTES, ACCREDITATION_RANKS, type AiResult, type DashboardStats, type PublicStats } from '@akreditasi/shared';
import { aiTotals } from '../ai/score.js';
import type { AppContext } from '../context.js';
import { q, q1 } from '../db/pool.js';
import { envelope, mount } from '../lib/http.js';

const STAGES: { key: string; label: string }[] = [
  { key: 'pengajuan', label: 'Pengajuan' },
  { key: 'verifikasi', label: 'Verifikasi kelengkapan' },
  { key: 'pembayaran', label: 'Tagihan dan pembayaran' },
  { key: 'penugasan', label: 'Penugasan, AK, jadwal AL' },
  { key: 'al', label: 'Asesmen Lapangan' },
  { key: 'tanggapan', label: 'Tanggapan' },
  { key: 'verifikasi_akhir', label: 'Verifikasi akhir' },
  { key: 'penetapan', label: 'Penetapan' },
  { key: 'penerbitan', label: 'Penerbitan' },
  { key: 'selesai', label: 'Selesai' },
];

/** Sama dengan listSubmissions: UPPS hanya miliknya, asesor hanya yang ditugaskan, peran lain semua. Param: $1 user id, $2 mode. */
const SCOPE = `SELECT s.id, s.stage, s.ak_status, s.al_schedule_status, s.created_at FROM submissions s
  WHERE ($2::text = 'all'
     OR ($2::text = 'own' AND s.upps_user_id = $1::uuid)
     OR ($2::text = 'assigned' AND EXISTS (SELECT 1 FROM assessor_offers o WHERE o.submission_id = s.id AND $1::uuid IN (o.assessor1_id, o.assessor2_id))))`;

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const round = (v: number | null, d = 1): number | null => (v === null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);

export function dashboardRoutes(ctx: AppContext, router: Router, auth: RequestHandler) {
  mount(router, auth, API_ROUTES.publicStats, async (_req, res) => {
    const r = await q1(ctx.pool, `SELECT (SELECT count(*)::int FROM submissions WHERE stage <> 'draft') AS submissions, (SELECT count(*)::int FROM formal_records WHERE status = 'committed') AS tx`);
    const body: PublicStats = { submissions: r?.submissions ?? 0, onChainTx: r?.tx ?? 0 };
    res.json(envelope(body));
  });

  mount(router, auth, API_ROUTES.dashboardStats, async (req, res) => {
    const user = req.user!;
    const mode: DashboardStats['scope'] = user.role === 'upps' ? 'own' : user.role === 'asesor' ? 'assigned' : 'all';
    const p = [user.id, mode];
    const db = ctx.pool;

    const [stageRows, monthly, ranks, avgDec, chainTx, audit, lag, lastBlock, aiStatus, aiLatency, aiPairs, recent, actionRow] = await Promise.all([
      q(db, `WITH sc AS (${SCOPE})
        SELECT CASE
            WHEN sc.stage = 'draft' THEN 0
            WHEN sc.stage IN ('submitted','admin_revision','admin_rejected') THEN 1
            WHEN sc.stage IN ('admin_verified','invoice_issued','payment_proof_uploaded') THEN 2
            WHEN sc.stage IN ('payment_verified','in_assessment') AND sc.ak_status = 'consistency_approved' AND sc.al_schedule_status = 'approved' THEN 4
            WHEN sc.stage IN ('payment_verified','in_assessment') THEN 3
            WHEN sc.stage = 'al_submitted' THEN 5
            WHEN sc.stage = 'responses_completed' THEN 6
            WHEN sc.stage = 'final_verified' THEN 7
            WHEN sc.stage = 'decided' AND c.id IS NULL THEN 8
            ELSE 9 END AS idx, count(*)::int AS n
        FROM sc LEFT JOIN certificates c ON c.submission_id = sc.id GROUP BY 1`, p),
      q(db, `WITH sc AS (${SCOPE}),
        months AS (SELECT date_trunc('month', now()) - (g || ' months')::interval AS m FROM generate_series(11, 0, -1) g)
        SELECT to_char(months.m, 'YYYY-MM') AS month,
          (SELECT count(*)::int FROM sc WHERE date_trunc('month', sc.created_at) = months.m) AS submitted,
          (SELECT count(*)::int FROM formal_records f JOIN sc ON sc.id = f.submission_id
            WHERE f.record_type = 'DECISION' AND f.status = 'committed' AND f.version = 1 AND date_trunc('month', f.committed_at) = months.m) AS decided
        FROM months ORDER BY months.m`, p),
      q(db, `WITH sc AS (${SCOPE})
        SELECT d.rank, count(*)::int AS n FROM (
          SELECT DISTINCT ON (f.submission_id) f.payload->>'rank' AS rank FROM formal_records f JOIN sc ON sc.id = f.submission_id
          WHERE f.record_type = 'DECISION' AND f.status = 'committed' ORDER BY f.submission_id, f.version DESC) d GROUP BY d.rank`, p),
      q1(db, `WITH sc AS (${SCOPE})
        SELECT avg(extract(epoch FROM (f.committed_at - sc.created_at)) / 86400)::float AS days
        FROM formal_records f JOIN sc ON sc.id = f.submission_id WHERE f.record_type = 'DECISION' AND f.status = 'committed' AND f.version = 1`, p),
      q1(db, `WITH sc AS (${SCOPE})
        SELECT count(*)::int AS tx, count(*) FILTER (WHERE f.version > 1)::int AS corrections
        FROM formal_records f JOIN sc ON sc.id = f.submission_id WHERE f.status = 'committed'`, p),
      q1(db, `WITH sc AS (${SCOPE})
        SELECT count(*) FILTER (WHERE a.status = 'pending')::int AS pending, count(*) FILTER (WHERE a.status = 'committed')::int AS committed, count(*) FILTER (WHERE a.status = 'failed')::int AS failed
        FROM outbox o JOIN sc ON sc.id = o.submission_id JOIN audit_status a ON a.event_id = o.id`, p),
      q1(db, `WITH sc AS (${SCOPE})
        SELECT avg(extract(epoch FROM (a.committed_at - o.created_at)))::float AS avg_s,
               percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM (a.committed_at - o.created_at)))::float AS p95_s
        FROM outbox o JOIN sc ON sc.id = o.submission_id JOIN audit_status a ON a.event_id = o.id WHERE a.status = 'committed' AND a.committed_at IS NOT NULL`, p),
      q1(db, `WITH sc AS (${SCOPE})
        SELECT greatest(
          (SELECT max(f.block_number) FROM formal_records f JOIN sc ON sc.id = f.submission_id WHERE f.status = 'committed'),
          (SELECT max(a.block_number) FROM outbox o JOIN sc ON sc.id = o.submission_id JOIN audit_status a ON a.event_id = o.id WHERE a.status = 'committed')
        ) AS block`, p),
      q(db, `WITH sc AS (${SCOPE}) SELECT ai.status, count(*)::int AS n FROM ai_analyses ai JOIN sc ON sc.id = ai.submission_id GROUP BY ai.status ORDER BY ai.status`, p),
      q1(db, `WITH sc AS (${SCOPE}) SELECT avg(ai.latency_ms)::float AS ms FROM ai_analyses ai JOIN sc ON sc.id = ai.submission_id WHERE ai.status = 'done' AND ai.latency_ms IS NOT NULL`, p),
      q(db, `WITH sc AS (${SCOPE})
        SELECT l.result, l.phase, (SELECT avg(a.total_score)::float FROM assessments a WHERE a.submission_id = l.submission_id AND a.phase = l.phase AND a.status = 'submitted' AND a.total_score IS NOT NULL) AS final_total
        FROM (SELECT DISTINCT ON (ai.submission_id, ai.phase) ai.submission_id, ai.phase, ai.result FROM ai_analyses ai JOIN sc ON sc.id = ai.submission_id
              WHERE ai.status = 'done' AND ai.result IS NOT NULL ORDER BY ai.submission_id, ai.phase, ai.finished_at DESC) l LIMIT 500`, p),
      q(db, `WITH sc AS (${SCOPE}),
        ev AS (
          (SELECT 'record'::text AS kind, f.record_type AS type, f.status, coalesce(f.committed_at, f.created_at) AS at, f.submission_id
             FROM formal_records f JOIN sc ON sc.id = f.submission_id ORDER BY coalesce(f.committed_at, f.created_at) DESC LIMIT 8)
          UNION ALL
          (SELECT 'audit'::text, o.type, a.status, o.created_at, o.submission_id
             FROM outbox o JOIN sc ON sc.id = o.submission_id JOIN audit_status a ON a.event_id = o.id ORDER BY o.created_at DESC LIMIT 8))
        SELECT ev.*, pr.name AS program_name, i.name AS institution_name FROM ev
          JOIN submissions s ON s.id = ev.submission_id JOIN study_programs pr ON pr.id = s.program_id JOIN institutions i ON i.id = s.institution_id
        ORDER BY ev.at DESC LIMIT 8`, p),
      q1(db, `WITH sc AS (${SCOPE})
        SELECT count(*) FILTER (WHERE
          CASE $3::text
            WHEN 'upps' THEN sc.stage IN ('draft','admin_revision','invoice_issued','al_submitted')
            WHEN 'sek_adm' THEN sc.stage = 'submitted' OR sc.al_schedule_status = 'proposed' OR sc.stage = 'decided'
            WHEN 'sek_keu' THEN sc.stage IN ('admin_verified','payment_proof_uploaded')
            WHEN 'kea' THEN sc.stage = 'responses_completed'
                 OR (sc.stage IN ('payment_verified','in_assessment') AND (sc.ak_status IN ('not_started','offer_rejected','ak_complete') OR sc.al_schedule_status IN ('not_started','rejected')))
            WHEN 'asesor' THEN (sc.stage = 'in_assessment' AND sc.ak_status IN ('offered','effective','ak_partial','consistency_returned')) OR sc.stage = 'al_submitted'
            WHEN 'majelis' THEN sc.stage = 'final_verified'
            ELSE false END)::int AS action FROM sc`, [...p, user.role]),
    ]);

    const counts = new Array<number>(STAGES.length).fill(0);
    for (const r of stageRows) counts[r.idx] = r.n;
    const total = counts.reduce((a, b) => a + b, 0);
    const completed = counts[9]!;

    const rankMap = new Map<string, number>(ranks.map((r) => [r.rank as string, r.n as number]));
    let compared = 0, within = 0, diffSum = 0;
    for (const r of aiPairs) {
      if (r.final_total === null || r.final_total === undefined) continue;
      const t = aiTotals(r.result as AiResult);
      if (!t.max) continue;
      const diff = Math.abs(t.total - Number(r.final_total)) / t.max * 100;
      compared++; diffSum += diff; if (diff <= 10) within++;
    }
    const lagAvg = num(lag?.avg_s), lagP95 = num(lag?.p95_s);

    const body: DashboardStats = {
      generatedAt: new Date().toISOString(),
      scope: mode,
      kpis: {
        total,
        actionRequired: actionRow?.action ?? 0,
        inProgress: total - completed,
        completed,
        avgDecisionDays: round(num(avgDec?.days)),
      },
      byStage: STAGES.map((s, i) => ({ index: i, key: s.key, label: s.label, count: counts[i]! })),
      monthly: monthly.map((m) => ({ month: m.month, submitted: m.submitted, decided: m.decided })),
      ranks: ACCREDITATION_RANKS.map((rank) => ({ rank, count: rankMap.get(rank) ?? 0 })),
      chain: {
        onChainTx: chainTx?.tx ?? 0,
        corrections: chainTx?.corrections ?? 0,
        audit: { pending: audit?.pending ?? 0, committed: audit?.committed ?? 0, failed: audit?.failed ?? 0 },
        auditLagAvgSec: round(lagAvg, 2),
        auditLagP95Sec: round(lagP95, 2),
        lastBlock: num(lastBlock?.block),
      },
      ai: {
        byStatus: aiStatus.map((r) => ({ status: r.status, count: r.n })),
        avgLatencySec: round(num(aiLatency?.ms) === null ? null : num(aiLatency?.ms)! / 1000),
        agreement: { compared, within, meanAbsDiffPct: compared ? round(diffSum / compared) : null },
      },
      recent: recent.map((r) => ({ kind: r.kind, type: r.type, status: r.status, at: new Date(r.at).toISOString(), submissionId: r.submission_id, programName: r.program_name, institutionName: r.institution_name })),
    };
    res.json(envelope(body));
  });
}
