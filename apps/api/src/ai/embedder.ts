import path from 'node:path';

/** Penyematan teks untuk retrieval. `id` mengidentifikasi model; indeks dan kueri HARUS memakai id yang sama. */
export interface Embedder {
  readonly id: string;
  readonly dim: number;
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
