import type { AiFallbackAttempt } from '@akreditasi/shared';
import { AiProviderError, RateLimiter, realSleep, withRetry, type AiProvider, type GenerateOptions, type GenerateResult, type Sleep } from './provider.js';

export interface GeminiOptions {
  apiKey: string;
  model: string;
  fallbackModels?: string[];
  embedModel: string;
  embedDim: number;
  thinkingLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  /** Percobaan per model sebelum pindah ke cadangan / menyerah. */
  attemptsPerModel?: number;
  retryBaseMs?: number;
  generateRpm?: number;
  embedRpm?: number;
  fetchImpl?: typeof fetch;
  sleep?: Sleep;
  baseUrl?: string;
  timeoutMs?: number;
}

const FALLBACK_STATUSES = new Set(['UNAVAILABLE', 'RESOURCE_EXHAUSTED']);

/** Keluarga 3.x memakai thinkingLevel; 2.5 dan lainnya: thinkingConfig dihilangkan. */
export function supportsThinkingLevel(model: string): boolean {
  return /^gemini-3(\.|-|$)/.test(model);
}

function parseRetryDelay(body: any, headers: Headers): number | undefined {
  const h = headers.get('retry-after');
  if (h && Number.isFinite(Number(h))) return Number(h) * 1000;
  const details: any[] = body?.error?.details ?? [];
  for (const d of details) {
    const m = typeof d?.retryDelay === 'string' ? /^([\d.]+)s$/.exec(d.retryDelay) : null;
    if (m) return Math.ceil(Number(m[1]) * 1000);
  }
  return undefined;
}

export async function toProviderError(res: Response): Promise<AiProviderError> {
  let body: any;
  try {
    body = await res.json();
  } catch {
    body = undefined;
  }
  const statusText: string = body?.error?.status ?? '';
  const code = statusText || `HTTP_${res.status}`;
  const message = `Gemini ${res.status} ${statusText}: ${String(body?.error?.message ?? res.statusText).slice(0, 300)}`;
  // Kuota HARIAN habis: mencoba ulang pada model yang sama sia-sia (pulih berjam-jam), tetapi model cadangan punya kuota sendiri.
  const daily = res.status === 429 && /per day|PerDay/i.test(JSON.stringify(body?.error ?? ''));
  const retryable = !daily && (res.status === 429 || res.status >= 500 || FALLBACK_STATUSES.has(statusText));
  const fallbackable = res.status === 429 || res.status === 503 || res.status === 404 || FALLBACK_STATUSES.has(statusText);
  return new AiProviderError(message, res.status, daily ? 'DAILY_QUOTA' : code, retryable, fallbackable, parseRetryDelay(body, res.headers));
}

export class GeminiProvider implements AiProvider {
  readonly name = 'gemini';
  readonly model: string;
  readonly embedModel: string;
  readonly embedDim: number;
  private readonly chain: string[];
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: Sleep;
  private readonly genLimiter: RateLimiter;
  private readonly embLimiter: RateLimiter;
  private readonly base: string;

  constructor(private readonly o: GeminiOptions) {
    this.model = o.model;
    this.embedModel = o.embedModel;
    this.embedDim = o.embedDim;
    this.chain = [o.model, ...(o.fallbackModels ?? []).filter((m) => m !== o.model)];
    this.fetchImpl = o.fetchImpl ?? fetch;
    this.sleep = o.sleep ?? realSleep;
    this.genLimiter = new RateLimiter(o.generateRpm ?? 4, this.sleep);
    // Tier gratis menghitung setiap teks dalam batch sebagai satu permintaan (±100/menit).
    this.embLimiter = new RateLimiter(o.embedRpm ?? 80, this.sleep);
    this.base = o.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
  }

  private async post(path: string, body: unknown, timeoutMs?: number): Promise<any> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.o.apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs ?? this.o.timeoutMs ?? 240_000),
      });
    } catch (err) {
      throw new AiProviderError(`Gemini tidak terjangkau: ${(err as Error).message}`, null, 'NETWORK', true, true);
    }
    if (!res.ok) throw await toProviderError(res);
    return res.json();
  }

  async generateJson(prompt: string, schema: object, opts: GenerateOptions = {}): Promise<GenerateResult> {
    const fallbacks: AiFallbackAttempt[] = [];
    let lastErr: unknown;
    for (const model of this.chain) {
      const generationConfig: Record<string, unknown> = { responseMimeType: 'application/json', responseSchema: schema };
      const thinking = supportsThinkingLevel(model) ? (opts.thinkingLevel ?? this.o.thinkingLevel) : null;
      if (thinking) generationConfig.thinkingConfig = { thinkingLevel: thinking };
      try {
        let started = Date.now();
        const data = await withRetry(
          async () => {
            await this.genLimiter.acquire();
            started = Date.now();
            return this.post(`models/${model}:generateContent`, { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig }, opts.timeoutMs);
          },
          { attempts: opts.attempts ?? this.o.attemptsPerModel ?? 2, baseDelayMs: this.o.retryBaseMs ?? 5000, sleep: this.sleep },
        );
        const latencyMs = Date.now() - started;
        const parts: any[] = data?.candidates?.[0]?.content?.parts ?? [];
        const text = parts.filter((p) => typeof p?.text === 'string' && !p.thought).map((p) => p.text).join('');
        if (!text) {
          throw new AiProviderError(`Gemini tidak mengembalikan teks (finishReason=${data?.candidates?.[0]?.finishReason ?? 'unknown'})`, 200, 'EMPTY', true, false);
        }
        let json: unknown;
        try {
          json = JSON.parse(text);
        } catch {
          throw new AiProviderError('Keluaran Gemini bukan JSON valid', 200, 'INVALID_OUTPUT', true, false);
        }
        const modelVersion: string | null = typeof data?.modelVersion === 'string' ? data.modelVersion : null;
        const usage = data?.usageMetadata ?? {};
        return {
          json,
          text,
          requestedModel: this.model,
          usedModel: modelVersion ?? model,
          modelVersion,
          thinkingLevel: thinking,
          inputTokens: usage.promptTokenCount ?? null,
          outputTokens: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0) || null,
          latencyMs,
          fallbacks,
        };
      } catch (err) {
        lastErr = err;
        if (err instanceof AiProviderError && err.fallbackable) {
          fallbacks.push({ model, code: err.code, at: new Date().toISOString() });
          continue;
        }
        throw err;
      }
    }
    // Seluruh rantai model habis; lampirkan daftar percobaan pada galat terakhir.
    if (lastErr instanceof AiProviderError) {
      const e = new AiProviderError(lastErr.message, lastErr.status, lastErr.code, lastErr.retryable, false, lastErr.retryAfterMs);
      (e as any).fallbacks = fallbacks;
      throw e;
    }
    throw lastErr;
  }

  async embed(texts: string[], taskType: 'document' | 'query'): Promise<number[][]> {
    const out: number[][] = [];
    const BATCH = 25;
    for (let i = 0; i < texts.length; i += BATCH) {
      const slice = texts.slice(i, i + BATCH);
      const data = await withRetry(
        async () => {
          await this.embLimiter.acquire(slice.length);
          return this.post(`models/${this.embedModel}:batchEmbedContents`, {
            requests: slice.map((t) => ({
              model: `models/${this.embedModel}`,
              content: { parts: [{ text: t }] },
              taskType: taskType === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT',
              outputDimensionality: this.embedDim,
            })),
          });
        },
        { attempts: 6, baseDelayMs: 5000, sleep: this.sleep },
      );
      const embs: any[] = data?.embeddings ?? [];
      if (embs.length !== slice.length) throw new AiProviderError('Jumlah embedding tidak sesuai', 200, 'EMBED_MISMATCH', true, false);
      for (const e of embs) {
        const v: number[] = e?.values ?? [];
        if (v.length !== this.embedDim) throw new AiProviderError(`Dimensi embedding ${v.length} != ${this.embedDim}`, 200, 'EMBED_DIM', false, false);
        out.push(v);
      }
    }
    return out;
  }
}
