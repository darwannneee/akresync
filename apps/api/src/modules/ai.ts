import type { RequestHandler, Router } from 'express';
import { z } from 'zod';
import { API_ROUTES, type AiAnalysisList, type AiComparison, type DocumentIndexInfo } from '@akreditasi/shared';
import { loadSubmissionForUser } from '../auth/rbac.js';
import type { AuthUser } from '../auth/types.js';
import type { AppContext } from '../context.js';
import { q, q1, type Queryable } from '../db/pool.js';
import { AppError, conflict, forbidden, notFound } from '../errors.js';
import { envelope, mount, parse, uuidParam } from '../lib/http.js';
import { compareSuggestionToFinal } from '../ai/compare.js';
import { analysisDto } from '../ai/service.js';
import { AiProviderError } from '../ai/provider.js';

/** Asesor: wajib berada pada penawaran aktif (ditawarkan/berlaku) terbaru. */
export async function assertAssessorActive(db: Queryable, submissionId: string, user: AuthUser, opts: { effective?: boolean; leadOnly?: boolean } = {}) {
  const o = await q1(db, `SELECT * FROM assessor_offers WHERE submission_id=$1 AND status IN ('offered','effective') ORDER BY offer_no DESC LIMIT 1`, [submissionId]);
  if (!o || ![o.assessor1_id, o.assessor2_id].includes(user.id)) throw forbidden('Anda bukan asesor pada penugasan aktif pengajuan ini');
  if (opts.effective && o.status !== 'effective') throw conflict('Penugasan belum berlaku');
  if (opts.leadOnly && o.lead_assessor_id !== user.id) throw forbidden('Hanya ketua asesor yang dapat meminta analisis fase lapangan');
}

const ANALYSIS_SELECT = `SELECT a.*, u.full_name AS requested_by_name FROM ai_analyses a LEFT JOIN users u ON u.id=a.requested_by`;

/** Aturan visibilitas: asesor melihat analisis otomatis + miliknya; peran lain melihat semuanya (UPPS: pengajuannya). */
export function visibilitySql(user: AuthUser, params: unknown[]): string {
  if (user.role !== 'asesor') return '';
  params.push(user.id);
  return `AND (a.trigger='auto' OR a.requested_by = $${params.length})`;
}

async function comparisonsFor(db: Queryable, user: AuthUser, submissionId: string, analyses: any[]): Promise<AiComparison[]> {
  if (user.role === 'upps') return [];
  const done = analyses.filter((a) => a.status === 'done' && a.result);
  if (!done.length) return [];
  const params: unknown[] = [submissionId];
  let own = '';
  if (user.role === 'asesor') {
    params.push(user.id);
    own = `AND a.assessor_id = $2`;
  }
  const rows = await q(db, `SELECT a.assessor_id, u.full_name, a.phase, a.status, a.scores FROM assessments a JOIN users u ON u.id=a.assessor_id WHERE a.submission_id=$1 ${own}`, params);
  const out: AiComparison[] = [];
  for (const an of done) {
    for (const r of rows.filter((x) => x.phase === an.phase)) {
      out.push(compareSuggestionToFinal(an.id, an.phase, { id: r.assessor_id, name: r.full_name }, an.result, r.scores, r.status));
    }
  }
  return out;
}

export function aiRoutes(ctx: AppContext, router: Router, auth: RequestHandler) {
  mount(router, auth, API_ROUTES.requestAiAnalysis, async (req, res) => {
    const user = req.user!;
    const id = uuidParam(req.params.id);
    const b = parse(z.object({ phase: z.enum(['AK', 'AL']).default('AK') }), req.body ?? {});
    if (!ctx.ai.enabled) throw new AppError(503, 'AI_DISABLED', 'Layanan AI belum dikonfigurasi pada server ini');
    await loadSubmissionForUser(ctx.pool, user, id);
    if (user.role === 'asesor') await assertAssessorActive(ctx.pool, id, user, { effective: true, leadOnly: b.phase === 'AL' });
    try {
      const { row, created } = await ctx.ai.requestManual(id, b.phase, user.id);
      res.status(202).json(envelope({ id: row.id, status: row.status, created }));
    } catch (err) {
      if (err instanceof AiProviderError && err.code === 'NO_DOCUMENTS') throw conflict('Dokumen LED dan LKPS belum lengkap');
      throw err;
    }
  });

  mount(router, auth, API_ROUTES.listAiAnalyses, async (req, res) => {
    const user = req.user!;
    const id = uuidParam(req.params.id);
    await loadSubmissionForUser(ctx.pool, user, id);
    if (user.role === 'asesor') await assertAssessorActive(ctx.pool, id, user);
    const params: unknown[] = [id];
    const rows = await q(ctx.pool, `${ANALYSIS_SELECT} WHERE a.submission_id=$1 ${visibilitySql(user, params)} ORDER BY a.created_at DESC LIMIT 50`, params);
    const idx = await q(
      ctx.pool,
      `SELECT d.id, d.doc_type, d.file_name, d.index_status, d.index_error, d.indexed_at, d.doc_check, d.index_stats,
              (SELECT count(*) FROM document_chunks c WHERE c.document_id=d.id) AS chunk_count
       FROM document_versions d JOIN submissions s ON s.id=d.submission_id AND s.document_set_version=d.set_version
       WHERE d.submission_id=$1 AND d.doc_type IN ('LED','LKPS') ORDER BY d.doc_type`,
      [id],
    );
    const index: DocumentIndexInfo[] = idx.map((d) => ({
      documentId: d.id, docType: d.doc_type, fileName: d.file_name, indexStatus: d.index_status, indexError: d.index_error,
      chunkCount: Number(d.chunk_count), indexedAt: d.indexed_at, embeddingDim: d.index_stats?.embeddingDim ?? null, embedModel: d.index_stats?.embedModel ?? null, embedded: d.index_stats?.embedded ?? null, total: d.index_stats?.total ?? null, check: d.doc_check ?? null,
    }));
    const dtos = rows.map((r) => analysisDto(r));
    const body: AiAnalysisList = {
      latest: dtos[0] ?? null,
      analyses: dtos,
      index,
      comparisons: await comparisonsFor(ctx.pool, user, id, rows),
      enabled: ctx.ai.enabled,
    };
    res.json(envelope(body));
  });

  mount(router, auth, API_ROUTES.getAiAnalysis, async (req, res) => {
    const user = req.user!;
    const params: unknown[] = [uuidParam(req.params.analysisId)];
    const row = await q1(ctx.pool, `${ANALYSIS_SELECT} WHERE a.id=$1`, params);
    if (!row) throw notFound('Analisis tidak ditemukan');
    await loadSubmissionForUser(ctx.pool, user, row.submission_id);
    if (user.role === 'asesor') {
      await assertAssessorActive(ctx.pool, row.submission_id, user);
      if (row.trigger !== 'auto' && row.requested_by !== user.id) throw notFound('Analisis tidak ditemukan');
    }
    const aud = await q1(ctx.pool, `SELECT a.status, a.tx_id FROM outbox o JOIN audit_status a ON a.event_id=o.id WHERE o.type='AIAnalysisSaved' AND o.aggregateid=$1 ORDER BY o.created_at DESC LIMIT 1`, [row.id]);
    const dto = analysisDto(row, { detail: true });
    dto.auditStatus = aud?.status ?? null;
    dto.auditTxId = aud?.tx_id ?? null;
    dto.comparisons = await comparisonsFor(ctx.pool, user, row.submission_id, [row]);
    res.json(envelope(dto));
  });

  mount(router, auth, API_ROUTES.reindexDocuments, async (req, res) => {
    const id = uuidParam(req.params.id);
    await loadSubmissionForUser(ctx.pool, req.user!, id);
    if (!ctx.ai.enabled) throw new AppError(503, 'AI_DISABLED', 'Layanan AI belum dikonfigurasi pada server ini');
    const n = await ctx.ai.reindex(id);
    res.status(202).json(envelope({ submissionId: id, documents: n }));
  });
}
