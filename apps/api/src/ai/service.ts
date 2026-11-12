import type { Pool } from 'pg';
import {
  type AiAnalysisDto,
  type AiCitation,
  type AiProgress,
  type AiResult,
  type AiRetrievedRef,
  type AppRole,
  type DocCheck,
} from '@akreditasi/shared';
import { hashSnapshot, sha256Hex } from '@akreditasi/shared/node';
import type { Config } from '../config/index.js';
import { recordAuditEvent } from '../db/outbox.js';
import { q, q1, withTransaction, type Queryable } from '../db/pool.js';
import { logger } from '../logger.js';
import type { IpfsClient } from '../ipfs/client.js';
import { fetchAndDecrypt } from '../modules/common.js';
import { estimateTokens } from './chunk.js';
import { extractAndChunk, extractSample } from './extract.js';
import { aiTotals } from './score.js';
import { buildPrompt, assignShortIds, PROMPT_TEMPLATE_SHA256, PROMPT_VERSION, RESPONSE_SCHEMA } from './prompt.js';
import type { Embedder } from './embedder.js';
import { friendlyAiError, jobRetryDelay, AiProviderError, type AiProvider } from './provider.js';
import { assembleContext, buildQueries, keywordRank, type Candidate } from './retrieval.js';
import { validateOutput } from './validate.js';
import { pendingCheck, verifyDocType } from './verify.js';

export const AUTO_DEBOUNCE_SECONDS = 6;
const POLL_MS = 4000;

export interface AiServiceDeps {
  pool: Pool;
  config: Config;
  ipfs: IpfsClient;
  provider: AiProvider | null;
  embedder?: Embedder | null;
}

const vec = (v: number[]) => `[${v.join(',')}]`;
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

export class AiService {
  private timer?: NodeJS.Timeout;
  private busy = false;
  private stopped = true;

  constructor(private readonly d: AiServiceDeps) {}

  get enabled(): boolean {
    return !!this.d.provider;
  }
  get provider(): AiProvider | null {
    return this.d.provider;
  }
  get embedder(): Embedder | null {
    return this.d.embedder ?? null;
  }

  // ---------- siklus hidup ----------
  async start(): Promise<void> {
    if ((!this.enabled && !this.embedder) || !this.d.config.AI_JOBS_ENABLED) {
      logger.info({ enabled: this.enabled }, 'job AI tidak dijalankan');
      return;
    }
    this.stopped = false;
    // Lanjut setelah restart: pekerjaan yang sedang berjalan dikembalikan ke antrean.
    await this.d.pool.query(`UPDATE document_versions SET index_status='pending' WHERE index_status='indexing'`);
    await this.d.pool.query(`UPDATE ai_analyses SET status='queued', updated_at=now() WHERE status='running'`);
    this.timer = setInterval(() => void this.tick(), POLL_MS);
    this.kick();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
  }

  kick(): void {
    if (!this.stopped) setImmediate(() => void this.tick());
  }

  async tick(): Promise<void> {
    if (this.busy || this.stopped) return;
    this.busy = true;
    try {
      while (!this.stopped && (await this.workOne())) {
        /* lanjut selama masih ada pekerjaan */
      }
    } catch (err) {
      logger.error({ err }, 'job AI: galat tak tertangani');
    } finally {
      this.busy = false;
    }
  }

  /** Satu langkah pekerjaan (konkurensi 1). Mengembalikan true bila ada yang dikerjakan. */
  async workOne(): Promise<boolean> {
    const doc = await q1(
      this.d.pool,
      `SELECT d.* FROM document_versions d JOIN submissions s ON s.id = d.submission_id AND s.document_set_version = d.set_version
       WHERE d.index_status='pending' AND d.doc_type IN ('LED','LKPS') AND (d.index_retry_at IS NULL OR d.index_retry_at <= now())
         AND (SELECT count(DISTINCT x.doc_type) FROM document_versions x WHERE x.submission_id=d.submission_id AND x.set_version=d.set_version AND x.doc_type IN ('LED','LKPS')) = 2
         AND (SELECT max(x.created_at) FROM document_versions x WHERE x.submission_id=d.submission_id AND x.set_version=d.set_version AND x.doc_type IN ('LED','LKPS')) < now() - make_interval(secs => $1)
       ORDER BY d.created_at LIMIT 1`,
      [AUTO_DEBOUNCE_SECONDS],
    );
    if (doc) {
      await this.indexDocument(doc);
      return true;
    }
    if (await this.queueAutoAnalyses()) return true;
    const a = await q1(this.d.pool, `SELECT id FROM ai_analyses WHERE status='queued' AND (next_attempt_at IS NULL OR next_attempt_at <= now()) ORDER BY created_at LIMIT 1`);
    if (a) {
      await this.runAnalysis(a.id);
      return true;
    }
    return false;
  }

  // ---------- verifikasi jenis dokumen saat unggah ----------
  /** Dipanggil di dalam permintaan unggah (LED/LKPS). `reject` terisi bila model menyatakan jenis tidak sesuai. */
  async verifyUpload(docType: 'LED' | 'LKPS', file: { buffer: Buffer; mimetype: string; originalname: string }): Promise<{ reject?: { message: string; reason: string | null; detectedType: string | null }; check: DocCheck | null }> {
    const p = this.d.provider;
    if (!p) return { check: null };
    const sample = await extractSample(file.mimetype, file.originalname, file.buffer);
    if (!sample) return { check: pendingCheck('Isi berkas tidak dapat diekstrak untuk diverifikasi', p.model) };
    const out = await verifyDocType(p, docType, sample);
    if (out.kind === 'invalid') {
      return {
        check: out.check,
        reject: {
          message: `Berkas yang diunggah tidak terdeteksi sebagai ${docType}. Mohon periksa kembali berkasnya.`,
          reason: out.check.reason,
          detectedType: out.check.detectedType,
        },
      };
    }
    return { check: out.check };
  }

  // ---------- pengindeksan ----------
  /**
   * Pengindeksan inkremental dan dapat dilanjutkan: potongan ditulis dahulu (embedding NULL), lalu disematkan per batch dan
   * disimpan segera. Setelah 429/restart hanya potongan yang belum bersemat yang diproses. Penyematan identik
   * (text_sha256 + model sama) dipakai ulang dari dokumen lain. Verifikasi jenis dokumen dijalankan SETELAH indeks selesai
   * dan tidak pernah menghalanginya.
   */
  async indexDocument(doc: any): Promise<void> {
    const pool = this.d.pool;
    const emb = this.embedder;
    const started = Date.now();
    await pool.query(`UPDATE document_versions SET index_status='indexing', index_error=NULL, index_retry_at=NULL WHERE id=$1`, [doc.id]);
    try {
      const data = await fetchAndDecrypt(this.d, doc);
      const ex = await extractAndChunk(doc.doc_type, doc.mime_type, doc.file_name, data);
      if (!ex.chunks.length) throw new Error('Berkas tidak menghasilkan teks yang dapat diindeks');
      const model = emb?.id ?? null;

      await withTransaction(async (c) => {
        const existing = await q(c, `SELECT chunk_index, text_sha256, embedding_model, (embedding IS NOT NULL) AS has FROM document_chunks WHERE document_id=$1`, [doc.id]);
        const byIdx = new Map(existing.map((r) => [r.chunk_index, r]));
        await c.query(`DELETE FROM document_chunks WHERE document_id=$1 AND chunk_index >= $2`, [doc.id, ex.chunks.length]);
        for (let i = 0; i < ex.chunks.length; i++) {
          const ch = ex.chunks[i]!;
          const sha = sha256Hex(ch.text);
          const cur = byIdx.get(i);
          if (cur && String(cur.text_sha256).trim() === sha) {
            // Teks sama: pertahankan; embedding dibuang bila dibuat oleh model lain.
            if (cur.embedding_model !== model) await c.query(`UPDATE document_chunks SET embedding=NULL, embedding_model=NULL, locator=$3 WHERE document_id=$1 AND chunk_index=$2`, [doc.id, i, ch.locator]);
            else await c.query(`UPDATE document_chunks SET locator=$3 WHERE document_id=$1 AND chunk_index=$2`, [doc.id, i, ch.locator]);
            continue;
          }
          await c.query(
            `INSERT INTO document_chunks (submission_id, document_id, set_version, doc_type, chunk_index, locator, text, text_sha256, token_estimate, embedding, embedding_model)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,
               (SELECT embedding FROM document_chunks WHERE text_sha256=$8 AND embedding_model=$10 AND embedding IS NOT NULL LIMIT 1), 
               CASE WHEN $10::text IS NULL THEN NULL ELSE (SELECT embedding_model FROM document_chunks WHERE text_sha256=$8 AND embedding_model=$10 AND embedding IS NOT NULL LIMIT 1) END)
             ON CONFLICT (document_id, chunk_index) DO UPDATE SET locator=EXCLUDED.locator, text=EXCLUDED.text, text_sha256=EXCLUDED.text_sha256,
               token_estimate=EXCLUDED.token_estimate, embedding=EXCLUDED.embedding, embedding_model=EXCLUDED.embedding_model`,
            [doc.submission_id, doc.id, doc.set_version, doc.doc_type, i, ch.locator, ch.text, sha, ch.tokenEstimate, model],
          );
        }
      }, pool);

      const total = ex.chunks.length;
      const progress = async (embedded: number) =>
        pool.query(`UPDATE document_versions SET index_stats=jsonb_build_object('embedded',$2::int,'total',$3::int,'embedModel',$4::text,'chunks',$3::int,'units',$5::int,'kind',$6::text) WHERE id=$1`, [doc.id, embedded, total, model, ex.stats.units, ex.stats.kind]);
      let embedded = total - Number((await q1(pool, `SELECT count(*) AS n FROM document_chunks WHERE document_id=$1 AND embedding IS NULL`, [doc.id]))!.n);
      if (!emb) embedded = 0;
      await progress(embedded);
      if (emb) {
        const BATCH = Math.max(1, this.d.config.AI_EMBED_BATCH);
        for (;;) {
          const todo = await q(pool, `SELECT chunk_index, text FROM document_chunks WHERE document_id=$1 AND embedding IS NULL ORDER BY chunk_index LIMIT $2`, [doc.id, BATCH]);
          if (!todo.length) break;
          const vecs = await emb.embed(todo.map((r) => clip(r.text, 6000)), 'passage');
          await withTransaction(async (c) => {
            for (let k = 0; k < todo.length; k++) {
              await c.query(`UPDATE document_chunks SET embedding=$3::vector, embedding_model=$4 WHERE document_id=$1 AND chunk_index=$2`, [doc.id, todo[k]!.chunk_index, vec(vecs[k]!), emb.id]);
            }
          }, pool);
          embedded += todo.length;
          await progress(embedded);
        }
      }
      await pool.query(
        `UPDATE document_versions SET index_status='indexed', indexed_at=now(), index_error=NULL,
           index_stats=$2::jsonb WHERE id=$1`,
        [doc.id, JSON.stringify({ kind: ex.stats.kind, units: ex.stats.units, chars: ex.stats.chars, chunks: total, embedded: emb ? total : 0, total, tokens: ex.chunks.reduce((a, x) => a + x.tokenEstimate, 0), embeddingDim: emb?.dim ?? null, embedModel: model, ms: Date.now() - started })],
      );
      logger.info({ documentId: doc.id, docType: doc.doc_type, chunks: total, embedModel: model, ms: Date.now() - started }, 'dokumen terindeks');
    } catch (err) {
      const retryable = err instanceof AiProviderError && err.retryable;
      logger.warn({ err, documentId: doc.id, retryable }, 'pengindeksan terhenti');
      const msg = clip(err instanceof AiProviderError ? friendlyAiError(err) : (err as Error).message, 500);
      if (retryable) {
        // Kemajuan tersimpan; coba lagi setelah jeda (menghormati retryAfter).
        const wait = Math.max((err as AiProviderError).retryAfterMs ?? 0, 15000);
        await pool.query(`UPDATE document_versions SET index_status='pending', index_error=$2, index_retry_at=now()+make_interval(secs => $3) WHERE id=$1`, [doc.id, msg, wait / 1000]);
      } else {
        await pool.query(`UPDATE document_versions SET index_status='failed', index_error=$2 WHERE id=$1`, [doc.id, msg]);
      }
      return;
    }
    await this.verifyAfterIndex(doc);
  }

  /** Verifikasi jenis tertunda dicoba ulang sesudah indeks (1 percobaan); kegagalan tidak memengaruhi indeks. */
  private async verifyAfterIndex(doc: any): Promise<void> {
    const provider = this.d.provider;
    if (!provider) return;
    try {
      const cur = (await q1(this.d.pool, `SELECT doc_check FROM document_versions WHERE id=$1`, [doc.id]))?.doc_check as DocCheck | null | undefined;
      if (cur && cur.status !== 'pending') return;
      const same = await q1(this.d.pool, `SELECT doc_check FROM document_versions WHERE sha256_plain=$1 AND doc_type=$2 AND id<>$3 AND doc_check->>'status' IN ('verified','mismatch') LIMIT 1`, [doc.sha256_plain, doc.doc_type, doc.id]);
      let check: DocCheck | undefined = same?.doc_check;
      if (!check) {
        const sample = (await q(this.d.pool, `SELECT text FROM document_chunks WHERE document_id=$1 ORDER BY chunk_index LIMIT 3`, [doc.id])).map((r) => r.text).join('\n');
        const out = await verifyDocType(provider, doc.doc_type, sample, { attempts: 1 });
        if (out.kind === 'pending') {
          if (!cur) check = out.check;
        } else check = out.kind === 'invalid' ? { ...out.check, status: 'mismatch' } : out.check;
      }
      if (check) await this.d.pool.query(`UPDATE document_versions SET doc_check=$2::jsonb, checked_at=now() WHERE id=$1`, [doc.id, JSON.stringify(check)]);
    } catch (err) {
      logger.warn({ err, documentId: doc.id }, 'verifikasi jenis pasca-indeks gagal (diabaikan)');
    }
  }

  /** Tandai ulang dokumen LED/LKPS pada set terbaru agar diindeks ulang (juga verifikasi tertunda). */
  async reindex(submissionId: string): Promise<number> {
    const r = await this.d.pool.query(
      `UPDATE document_versions d SET index_status='pending', index_error=NULL
       FROM submissions s WHERE s.id=d.submission_id AND d.submission_id=$1 AND d.set_version=s.document_set_version AND d.doc_type IN ('LED','LKPS')`,
      [submissionId],
    );
    this.kick();
    return r.rowCount ?? 0;
  }

  // ---------- pembuatan analisis ----------
  /** Analisis otomatis: set dokumen terkini lengkap (LED+LKPS), sudah tenang, belum punya analisis otomatis. */
  async queueAutoAnalyses(): Promise<boolean> {
    if (!this.d.config.AI_AUTO_ANALYSIS) return false;
    const cap = this.d.config.AI_AUTO_MAX_PER_DAY;
    const used = await q1<{ n: string }>(this.d.pool, `SELECT count(*) AS n FROM ai_analyses WHERE trigger='auto' AND created_at > now() - interval '24 hours'`);
    if (Number(used?.n ?? 0) >= cap) return false;
    const row = await q1(
      this.d.pool,
      `SELECT d.submission_id, d.set_version, s.upps_user_id FROM document_versions d
         JOIN submissions s ON s.id=d.submission_id AND s.document_set_version=d.set_version
       WHERE d.doc_type IN ('LED','LKPS')
         AND d.created_at > (SELECT applied_at FROM schema_migrations WHERE name='003_ai.sql')
       GROUP BY d.submission_id, d.set_version, s.upps_user_id
       HAVING count(DISTINCT d.doc_type)=2 AND max(d.created_at) < now() - make_interval(secs => $1)
          AND NOT EXISTS (SELECT 1 FROM ai_analyses a WHERE a.submission_id=d.submission_id AND a.set_version=d.set_version AND a.trigger='auto')
       LIMIT 1`,
      [AUTO_DEBOUNCE_SECONDS],
    );
    if (!row) return false;
    await this.d.pool.query(
      `INSERT INTO ai_analyses (submission_id, phase, status, trigger, set_version, requested_model, model, prompt_version, thinking_level)
       VALUES ($1,'AK','queued','auto',$2,$3,$3,$4,$5) ON CONFLICT DO NOTHING`,
      [row.submission_id, row.set_version, this.d.provider?.model ?? null, PROMPT_VERSION, this.d.config.GEMINI_THINKING_LEVEL],
    );
    return true;
  }

  /** Analisis ulang manual. Mengembalikan baris (yang sedang antre/berjalan bila sudah ada). */
  async requestManual(submissionId: string, phase: 'AK' | 'AL', userId: string): Promise<{ row: any; created: boolean }> {
    const sub = await q1(this.d.pool, `SELECT document_set_version AS v FROM submissions WHERE id=$1`, [submissionId]);
    const v = sub?.v as number;
    const docs = await q(this.d.pool, `SELECT doc_type FROM document_versions WHERE submission_id=$1 AND set_version=$2 AND doc_type IN ('LED','LKPS')`, [submissionId, v]);
    if (new Set(docs.map((x) => x.doc_type)).size < 2) throw new AiProviderError('Dokumen LED dan LKPS belum lengkap', null, 'NO_DOCUMENTS', false, false);
    const active = await q1(this.d.pool, `SELECT * FROM ai_analyses WHERE submission_id=$1 AND status IN ('queued','running') ORDER BY created_at DESC LIMIT 1`, [submissionId]);
    if (active) return { row: active, created: false };
    // Dokumen lama yang dilewati/gagal diindeks dahulu.
    await this.d.pool.query(`UPDATE document_versions SET index_status='pending', index_error=NULL WHERE submission_id=$1 AND set_version=$2 AND doc_type IN ('LED','LKPS') AND index_status IN ('skipped','failed')`, [submissionId, v]);
    const row = await q1(
      this.d.pool,
      `INSERT INTO ai_analyses (submission_id, phase, status, trigger, set_version, requested_by, requested_model, model, prompt_version, thinking_level)
       VALUES ($1,$2,'queued','manual',$3,$4,$5,$5,$6,$7) RETURNING *`,
      [submissionId, phase, v, userId, this.d.provider?.model ?? null, PROMPT_VERSION, this.d.config.GEMINI_THINKING_LEVEL],
    );
    this.kick();
    return { row, created: true };
  }

  // ---------- eksekusi analisis ----------
  async retrieve(submissionId: string, docIds: string[]): Promise<{ chosen: Candidate[]; truncated: boolean; mode: 'vector' | 'keyword' }> {
    const pool = this.d.pool;
    const emb = this.embedder;
    const queries = buildQueries();
    const missing = emb ? await q1<{ n: string }>(pool, `SELECT count(*) AS n FROM document_chunks WHERE document_id = ANY($1::uuid[]) AND (embedding IS NULL OR embedding_model IS DISTINCT FROM $2)`, [docIds, emb.id]) : undefined;
    const useVector = !!emb && Number(missing?.n ?? 1) === 0;
    const toCand = (r: any): Candidate => ({ id: r.id, documentId: r.document_id, docType: r.doc_type, chunkIndex: r.chunk_index, locator: r.locator, text: r.text, textSha256: String(r.text_sha256).trim(), tokenEstimate: r.token_estimate, score: Number(r.score) });
    const results: Candidate[][] = [];
    if (useVector) {
      const qv = await emb!.embed(queries.map((x) => x.text), 'query');
      for (let i = 0; i < queries.length; i++) {
        const rows = await q(
          pool,
          `SELECT id, document_id, doc_type, chunk_index, locator, text, text_sha256, token_estimate, 1 - (embedding <=> $1::vector) AS score
           FROM document_chunks WHERE document_id = ANY($2::uuid[]) AND embedding_model = $4 ORDER BY embedding <=> $1::vector LIMIT $3`,
          [vec(qv[i]!), docIds, queries[i]!.k, emb!.id],
        );
        results.push(rows.map(toCand));
      }
    } else {
      logger.warn({ submissionId }, 'retrieval kata kunci dipakai (embedding belum lengkap atau model tidak cocok)');
      const all = (await q(pool, `SELECT id, document_id, doc_type, chunk_index, locator, text, text_sha256, token_estimate FROM document_chunks WHERE document_id = ANY($1::uuid[])`, [docIds])).map((r) => ({ ...r, score: 0 }));
      for (const qq of queries) results.push(keywordRank(all, qq.text, qq.k).map(toCand));
    }
    const { chosen, truncated } = assembleContext(results, this.d.config.AI_MAX_CONTEXT_TOKENS);
    return { chosen, truncated, mode: useVector ? 'vector' : 'keyword' };
  }

  async runAnalysis(id: string): Promise<void> {
    const pool = this.d.pool;
    const claimed = await q1(pool, `UPDATE ai_analyses SET status='running', attempts=attempts+1, error=NULL, started_at=COALESCE(started_at, now()), next_attempt_at=NULL, updated_at=now() WHERE id=$1 AND status='queued' RETURNING *`, [id]);
    if (!claimed) return;
    try {
      const provider = this.d.provider;
      if (!provider) throw new AiProviderError('AI belum dikonfigurasi', null, 'NOT_CONFIGURED', false, false);
      const docs = await q(pool, `SELECT id, doc_type, index_status, index_error FROM document_versions WHERE submission_id=$1 AND set_version=$2 AND doc_type IN ('LED','LKPS')`, [claimed.submission_id, claimed.set_version]);
      if (docs.length < 2) throw new AiProviderError('Dokumen LED/LKPS tidak lengkap', null, 'NO_DOCUMENTS', false, false);
      if (docs.some((d) => d.index_status === 'pending' || d.index_status === 'indexing')) {
        await pool.query(`UPDATE ai_analyses SET status='queued', attempts=attempts-1, next_attempt_at=now()+interval '5 seconds', updated_at=now() WHERE id=$1`, [id]);
        return;
      }
      const bad = docs.find((d) => d.index_status !== 'indexed');
      if (bad) throw new AiProviderError(`Pengindeksan ${bad.doc_type} belum berhasil: ${bad.index_error ?? bad.index_status}`, null, 'NOT_INDEXED', false, false);

      const { chosen, mode } = await this.retrieve(claimed.submission_id, docs.map((d) => d.id));
      const shortIds = assignShortIds(chosen.map((c) => c.id));
      const prompt = buildPrompt(claimed.phase, chosen.map((c) => ({ shortId: shortIds.get(c.id)!, docType: c.docType, locator: c.locator, text: c.text })));
      const retrieved: AiRetrievedRef[] = chosen.map((c) => ({ chunkId: c.id, documentId: c.documentId, locator: c.locator, textSha256: c.textSha256, score: Math.round(c.score * 10000) / 10000, docType: c.docType, excerpt: clip(c.text, 1500) }));
      await pool.query(`UPDATE ai_analyses SET retrieved=$2::jsonb, embedding_model=$3, updated_at=now() WHERE id=$1`, [id, JSON.stringify(retrieved), mode === 'vector' ? this.embedder!.id : 'keyword']);
      logger.info({ analysisId: id, chunks: chosen.length, tokensApprox: estimateTokens(prompt), mode }, 'analisis AI: memanggil model');

      const gen = await provider.generateJson(prompt, RESPONSE_SCHEMA);
      const reverse = new Map([...shortIds].map(([full, short]) => [short, full]));
      const { result, dropped } = validateOutput(gen.json, reverse);
      const resultSha = hashSnapshot(result);
      await this.persistDone(claimed, { gen, result, dropped, resultSha, retrieved, embeddingModel: mode === 'vector' ? this.embedder!.id : 'keyword' });
      logger.info({ analysisId: id, items: result.items.length, latencyMs: gen.latencyMs, model: gen.usedModel }, 'analisis AI selesai');
    } catch (err) {
      await this.handleFailure(claimed, err);
    }
  }

  private async persistDone(row: any, o: { gen: Awaited<ReturnType<AiProvider['generateJson']>>; result: AiResult; dropped: unknown[]; resultSha: string; retrieved: AiRetrievedRef[]; embeddingModel?: string }): Promise<void> {
    const actor = await this.actorFor(row);
    await withTransaction(async (c) => {
      const done = await q1(
        c,
        `UPDATE ai_analyses SET status='done', model=$2, requested_model=$3, used_model=$4, model_version=$5, fallbacks=$6::jsonb, thinking_level=$7,
           result=$8::jsonb, result_sha256=$9, dropped=$10::jsonb, input_tokens=$11, output_tokens=$12, latency_ms=$13, prompt_version=$14, prompt_template_sha256=$15,
           error=NULL, finished_at=now(), updated_at=now() WHERE id=$1 AND status='running' RETURNING *`,
        [row.id, o.gen.usedModel, o.gen.requestedModel, o.gen.usedModel, o.gen.modelVersion, JSON.stringify(o.gen.fallbacks), o.gen.thinkingLevel, JSON.stringify(o.result), o.resultSha, JSON.stringify(o.dropped), o.gen.inputTokens, o.gen.outputTokens, o.gen.latencyMs, PROMPT_VERSION, PROMPT_TEMPLATE_SHA256],
      );
      if (!done) throw new Error('analisis bukan berstatus running');
      await recordAuditEvent(c, {
        aggregateType: 'ai_analysis',
        aggregateId: row.id,
        submissionId: row.submission_id,
        kind: 'AIAnalysisSaved',
        version: 1,
        snapshot: {
          id: row.id,
          submissionId: row.submission_id,
          phase: row.phase,
          trigger: row.trigger,
          setVersion: row.set_version,
          model: o.gen.requestedModel,
          usedModel: o.gen.usedModel,
          modelVersion: o.gen.modelVersion,
          fallbackCount: o.gen.fallbacks.length,
          promptVersion: PROMPT_VERSION,
          promptTemplateSha256: PROMPT_TEMPLATE_SHA256,
          embeddingModel: o.embeddingModel ?? null,
          retrieved: o.retrieved.map((r) => ({ chunkId: r.chunkId, textSha256: r.textSha256 })),
          resultSha256: o.resultSha,
          inputTokens: o.gen.inputTokens,
          outputTokens: o.gen.outputTokens,
          latencyMs: o.gen.latencyMs,
        },
        actor,
      });
    }, this.d.pool);
  }

  private async actorFor(row: any): Promise<{ uid: string; role: AppRole }> {
    if (row.requested_by) {
      const u = await q1(this.d.pool, `SELECT id, role FROM users WHERE id=$1`, [row.requested_by]);
      if (u) return { uid: u.id, role: u.role };
    }
    // Analisis otomatis: dikaitkan dengan UPPS pemilik pengajuan yang mengunggah dokumen.
    const s = await q1(this.d.pool, `SELECT u.id, u.role FROM submissions s JOIN users u ON u.id=s.upps_user_id WHERE s.id=$1`, [row.submission_id]);
    return { uid: s!.id, role: s!.role };
  }

  private async handleFailure(row: any, err: unknown): Promise<void> {
    const retryable = err instanceof AiProviderError ? err.retryable : false;
    const fallbacks = (err as any)?.fallbacks ?? [];
    const message = friendlyAiError(err);
    logger.warn({ analysisId: row.id, attempt: row.attempts, retryable, err: (err as Error).message }, 'analisis AI gagal pada percobaan ini');
    if (retryable && row.attempts < this.d.config.AI_JOB_MAX_ATTEMPTS) {
      const delay = jobRetryDelay(this.d.config.AI_RETRY_DELAYS_MS, row.attempts, err instanceof AiProviderError ? err.retryAfterMs : 0);
      await this.d.pool.query(
        `UPDATE ai_analyses SET status='queued', error=$2, fallbacks=$3::jsonb, next_attempt_at=now()+make_interval(secs => $4), updated_at=now() WHERE id=$1`,
        [row.id, message, JSON.stringify(fallbacks), delay / 1000],
      );
    } else {
      await this.d.pool.query(`UPDATE ai_analyses SET status='failed', error=$2, fallbacks=$3::jsonb, finished_at=now(), updated_at=now() WHERE id=$1`, [row.id, message, JSON.stringify(fallbacks)]);
    }
  }

  // ---------- pembacaan ----------
  async progress(db: Queryable, submissionId: string): Promise<AiProgress> {
    const sub = await q1(db, `SELECT document_set_version AS v FROM submissions WHERE id=$1`, [submissionId]);
    const v: number = sub?.v ?? 1;
    const docs = await q(db, `SELECT id, doc_type, file_name, index_status, doc_check, index_stats FROM document_versions WHERE submission_id=$1 AND set_version=$2 AND doc_type IN ('LED','LKPS') ORDER BY doc_type`, [submissionId, v]);
    const a = await q1(db, `SELECT status, attempts, finished_at FROM ai_analyses WHERE submission_id=$1 AND set_version=$2 ORDER BY created_at DESC LIMIT 1`, [submissionId, v]);
    const documents = docs.map((d) => ({ documentId: d.id, docType: d.doc_type, fileName: d.file_name, checked: !!d.doc_check && d.doc_check.status !== 'pending', check: (d.doc_check ?? null) as DocCheck | null, indexStatus: d.index_status, embedded: d.index_stats?.embedded ?? null, total: d.index_stats?.total ?? null }));
    let phase: AiProgress['phase'];
    if (documents.length < 2) phase = 'waiting_documents';
    else if (a?.status === 'done') phase = 'done';
    else if (a?.status === 'failed') phase = 'failed';
    else if (a) phase = documents.every((d) => d.indexStatus === 'indexed') ? 'analyzing' : 'indexing';
    else phase = documents.every((d) => d.indexStatus === 'indexed') ? 'analyzing' : documents.every((d) => d.checked) ? 'indexing' : 'checking';
    return { enabled: this.enabled, setVersion: v, documents, analysis: a ? { status: a.status, attempts: a.attempts, finishedAt: a.finished_at } : null, phase };
  }

  /** Skor AI terbaru (selesai) per pengajuan, untuk daftar/dasbor. */
  async scoreSummaries(db: Queryable, submissionIds: string[]): Promise<Map<string, { analysisId: string; setVersion: number | null; finishedAt: string | null; totals: ReturnType<typeof aiTotals> }>> {
    const out = new Map<string, any>();
    if (!submissionIds.length) return out;
    const rows = await q(db, `SELECT DISTINCT ON (submission_id) id, submission_id, set_version, finished_at, result FROM ai_analyses WHERE submission_id = ANY($1::uuid[]) AND status='done' AND result IS NOT NULL ORDER BY submission_id, finished_at DESC`, [submissionIds]);
    for (const r of rows) out.set(r.submission_id, { analysisId: r.id, setVersion: r.set_version, finishedAt: r.finished_at, totals: aiTotals(r.result as AiResult) });
    return out;
  }
}

export function analysisDto(r: any, opts: { detail?: boolean } = {}): AiAnalysisDto {
  const result: AiResult | null = r.result ?? null;
  const retrieved: AiRetrievedRef[] = r.retrieved ?? [];
  let citations: AiCitation[] | undefined;
  if (opts.detail && result) {
    const cited = new Set(result.items.flatMap((i) => i.citations));
    citations = retrieved
      .filter((x) => cited.has(x.chunkId))
      .map((x) => ({ chunkId: x.chunkId, documentId: x.documentId, docType: x.docType ?? 'LED', locator: x.locator, textSha256: x.textSha256, excerpt: x.excerpt }));
  }
  return {
    id: r.id,
    submissionId: r.submission_id,
    phase: r.phase,
    status: r.status,
    attempts: r.attempts,
    error: r.error ?? null,
    requestedBy: r.requested_by ?? null,
    requestedByName: r.requested_by_name ?? null,
    createdAt: r.created_at,
    startedAt: r.started_at ?? null,
    finishedAt: r.finished_at ?? null,
    nextAttemptAt: r.next_attempt_at ?? null,
    setVersion: r.set_version ?? null,
    trigger: r.trigger,
    requestedModel: r.requested_model ?? null,
    usedModel: r.used_model ?? null,
    modelVersion: r.model_version ?? null,
    fallbacks: r.fallbacks ?? [],
    promptVersion: r.prompt_version ?? null,
    promptTemplateSha256: r.prompt_template_sha256 ? String(r.prompt_template_sha256).trim() : null,
    thinkingLevel: r.thinking_level ?? null,
    inputTokens: r.input_tokens ?? null,
    outputTokens: r.output_tokens ?? null,
    latencyMs: r.latency_ms ?? null,
    resultSha256: r.result_sha256 ? String(r.result_sha256).trim() : null,
    embeddingModel: r.embedding_model ?? null,
    retrievedCount: retrieved.length,
    droppedCitations: Array.isArray(r.dropped) ? r.dropped.filter((d: any) => d.reason === 'invalid_citation' || d.reason === 'no_valid_citation').length : 0,
    result,
    totals: result ? aiTotals(result) : null,
    ...(citations ? { citations } : {}),
  };
}
