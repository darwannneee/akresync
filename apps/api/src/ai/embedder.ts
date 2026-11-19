import path from 'node:path';
import { toOpenAiError } from './openai.js';
import { AiProviderError, RateLimiter, realSleep, withRetry, type Sleep } from './provider.js';

/** Penyematan teks untuk retrieval. `id` mengidentifikasi model; indeks dan kueri HARUS memakai id yang sama. */
export interface Embedder {
  readonly id: string;
  readonly dim: number;
  /** Ukuran batch yang disarankan untuk pengindeksan (bawaan: AI_EMBED_BATCH). */
  readonly batchSize?: number;
  embed(texts: string[], kind: 'passage' | 'query'): Promise<number[][]>;
}

export const LOCAL_MODEL_DEFAULT = 'Xenova/multilingual-e5-base';

/** E5 mensyaratkan awalan "passage: " untuk dokumen dan "query: " untuk kueri. */
export const e5Prefix = (kind: 'passage' | 'query', t: string): string => `${kind}: ${t}`;

/**
 * Embedding lokal (CPU) dengan transformers.js. Model dimuat sekali (singleton lazy dengan penjaga konkurensi),
 * mean pooling + normalisasi L2. Berkas model disimpan di `cacheDir`.
 */
export class LocalEmbedder implements Embedder {
  readonly id: string;
  readonly dim = 768;
  private extractor: Promise<any> | null = null;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly model: string,
    private readonly cacheDir: string,
    private readonly batch = 16,
    private readonly maxChars = 2400,
  ) {
    this.id = `local:${model}`;
  }

  private load(): Promise<any> {
    this.extractor ??= (async () => {
      const tf: any = await import('@huggingface/transformers');
      tf.env.cacheDir = path.resolve(this.cacheDir);
      tf.env.allowLocalModels = false;
      return tf.pipeline('feature-extraction', this.model, { dtype: 'q8' });
    })().catch((err) => {
      this.extractor = null;
      throw err;
    });
    return this.extractor;
  }

  /** Memuat model lebih awal (mis. saat start) agar permintaan pertama tidak menunggu unduhan. */
  warmup(): Promise<void> {
    return this.load().then(() => undefined);
  }

  embed(texts: string[], kind: 'passage' | 'query'): Promise<number[][]> {
    // Serialkan: satu inferensi pada satu waktu agar memori terkendali.
    const run = async () => {
      const ex = await this.load();
      const out: number[][] = [];
      for (let i = 0; i < texts.length; i += this.batch) {
        const slice = texts.slice(i, i + this.batch).map((t) => e5Prefix(kind, t.slice(0, this.maxChars)));
        const t = await ex(slice, { pooling: 'mean', normalize: true });
        const rows = t.tolist() as number[][];
        for (const r of rows) out.push(r);
        if (typeof t.dispose === 'function') t.dispose();
      }
      return out;
    };
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => undefined);
    return p;
  }
}

export interface OpenAiEmbedderOptions {
  apiKey: string;
  model: string;
  dim: number;
  rpm?: number;
  batchSize?: number;
  fetchImpl?: typeof fetch;
  sleep?: Sleep;
  baseUrl?: string;
}

/**
 * Embedding OpenAI (/v1/embeddings, bawaan text-embedding-3-small). `dimensions` dipotong ke `dim`
 * agar cocok dengan kolom vector(768). Vektor keluaran sudah ternormalisasi.
 */
export class OpenAiEmbedder implements Embedder {
  readonly id: string;
  readonly dim: number;
  readonly batchSize: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: Sleep;
  private readonly limiter: RateLimiter;

  constructor(private readonly o: OpenAiEmbedderOptions) {
    this.id = `openai:${o.model}@${o.dim}`;
    this.dim = o.dim;
    this.batchSize = o.batchSize ?? 96;
    this.fetchImpl = o.fetchImpl ?? fetch;
    this.sleep = o.sleep ?? realSleep;
    this.limiter = new RateLimiter(o.rpm ?? 300, this.sleep);
  }

  private async request(input: string[]): Promise<number[][]> {
    await this.limiter.acquire();
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.o.baseUrl ?? 'https://api.openai.com/v1'}/embeddings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.o.apiKey}` },
        body: JSON.stringify({ model: this.o.model, input, dimensions: this.dim, encoding_format: 'float' }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (err) {
      throw new AiProviderError(`OpenAI embedding tidak terjangkau: ${(err as Error).message}`, null, 'NETWORK', true, false);
    }
    if (!res.ok) throw await toOpenAiError(res);
    const data = (await res.json()) as { data?: { index: number; embedding: number[] }[] };
    const rows = [...(data.data ?? [])].sort((a, b) => a.index - b.index).map((d) => d.embedding);
    if (rows.length !== input.length || rows.some((r) => r.length !== this.dim)) throw new AiProviderError('Keluaran embedding OpenAI tidak sesuai', 200, 'INVALID_OUTPUT', true, false);
    return rows;
  }

  async embed(texts: string[], _kind?: 'passage' | 'query'): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const slice = texts.slice(i, i + this.batchSize).map((t) => t.replace(/\s+/g, ' ').trim() || '-');
      out.push(...(await withRetry(() => this.request(slice), { attempts: 3, baseDelayMs: 2000, sleep: this.sleep })));
    }
    return out;
  }
}

/** Pembungkus embedding Gemini (opsional, EMBEDDING_PROVIDER=gemini). */
export class GeminiEmbedder implements Embedder {
  readonly id: string;
  constructor(
    private readonly inner: { embed(texts: string[], taskType: 'document' | 'query'): Promise<number[][]> },
    model: string,
    readonly dim: number,
  ) {
    this.id = `gemini:${model}`;
  }
  embed(texts: string[], kind: 'passage' | 'query'): Promise<number[][]> {
    return this.inner.embed(texts, kind === 'query' ? 'query' : 'document');
  }
}
