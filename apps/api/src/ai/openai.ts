import { AiProviderError, RateLimiter, realSleep, withRetry, type AiProvider, type GenerateOptions, type GenerateResult, type Sleep } from './provider.js';
import { toStrictJsonSchema } from './openai-schema.js';

export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface OpenAiOptions {
  apiKey: string;
  model: string;
  /** Upaya penalaran bawaan bila pemanggil tidak menentukan. */
  reasoningEffort?: ReasoningEffort;
  attemptsPerModel?: number;
  retryBaseMs?: number;
  generateRpm?: number;
  fetchImpl?: typeof fetch;
  sleep?: Sleep;
  baseUrl?: string;
  timeoutMs?: number;
}

function parseRetryAfter(headers: Headers): number | undefined {
  const ms = headers.get('retry-after-ms');
  if (ms && Number.isFinite(Number(ms))) return Number(ms);
  const h = headers.get('retry-after');
  if (h && Number.isFinite(Number(h))) return Number(h) * 1000;
  return undefined;
}

export async function toOpenAiError(res: Response): Promise<AiProviderError> {
  let body: any;
  try {
    body = await res.json();
  } catch {
    body = undefined;
  }
  const apiCode: string = String(body?.error?.code ?? body?.error?.type ?? '');
  const message = `OpenAI ${res.status} ${apiCode}: ${String(body?.error?.message ?? res.statusText).slice(0, 300)}`;
  // Kuota/billing habis: pulih hanya setelah akun diisi, mencoba ulang sia-sia.
  if (apiCode === 'insufficient_quota' || apiCode === 'billing_hard_limit_reached') {
    return new AiProviderError(message, res.status, 'INSUFFICIENT_QUOTA', false, false);
  }
  if (res.status === 429) return new AiProviderError(message, 429, 'RESOURCE_EXHAUSTED', true, false, parseRetryAfter(res.headers));
  if (res.status === 503 || res.status === 502 || res.status === 504) return new AiProviderError(message, res.status, 'UNAVAILABLE', true, false, parseRetryAfter(res.headers));
  return new AiProviderError(message, res.status, apiCode || `HTTP_${res.status}`, res.status >= 500, false, parseRetryAfter(res.headers));
}

export class OpenAiProvider implements AiProvider {
  readonly name = 'openai';
  readonly model: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: Sleep;
  private readonly limiter: RateLimiter;
  private readonly base: string;

  constructor(private readonly o: OpenAiOptions) {
    this.model = o.model;
    this.fetchImpl = o.fetchImpl ?? fetch;
    this.sleep = o.sleep ?? realSleep;
    this.limiter = new RateLimiter(o.generateRpm ?? 4, this.sleep);
    this.base = o.baseUrl ?? 'https://api.openai.com/v1';
  }

  private async post(body: unknown, timeoutMs?: number): Promise<any> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}/responses`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.o.apiKey}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs ?? this.o.timeoutMs ?? 240_000),
      });
    } catch (err) {
      throw new AiProviderError(`OpenAI tidak terjangkau: ${(err as Error).message}`, null, 'NETWORK', true, false);
    }
    if (!res.ok) throw await toOpenAiError(res);
    return res.json();
  }

  async generateJson(prompt: string, schema: object, opts: GenerateOptions = {}): Promise<GenerateResult> {
    const effort: ReasoningEffort = opts.thinkingLevel ? (opts.thinkingLevel.toLowerCase() as ReasoningEffort) : (this.o.reasoningEffort ?? 'medium');
    const body = {
      model: this.model,
      input: prompt,
      reasoning: { effort },
      text: { format: { type: 'json_schema', name: 'akreditasi_output', schema: toStrictJsonSchema(schema), strict: true } },
      store: false,
    };
    let started = Date.now();
    const data = await withRetry(
      async () => {
        await this.limiter.acquire();
        started = Date.now();
        return this.post(body, opts.timeoutMs);
      },
      { attempts: opts.attempts ?? this.o.attemptsPerModel ?? 2, baseDelayMs: this.o.retryBaseMs ?? 5000, sleep: this.sleep },
    );
    const latencyMs = Date.now() - started;

    if (data?.status === 'incomplete') {
      throw new AiProviderError(`OpenAI respons tidak lengkap (${data?.incomplete_details?.reason ?? 'unknown'})`, 200, 'EMPTY', true, false);
    }
    const parts: any[] = (Array.isArray(data?.output) ? data.output : []).filter((i: any) => i?.type === 'message').flatMap((i: any) => (Array.isArray(i.content) ? i.content : []));
    if (parts.some((p) => p?.type === 'refusal')) {
      throw new AiProviderError('OpenAI menolak permintaan (refusal)', 200, 'INVALID_OUTPUT', false, false);
    }
    const text: string = typeof data?.output_text === 'string' && data.output_text ? data.output_text : parts.filter((p) => p?.type === 'output_text' && typeof p.text === 'string').map((p) => p.text).join('');
    if (!text) throw new AiProviderError('OpenAI tidak mengembalikan teks', 200, 'EMPTY', true, false);
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new AiProviderError('Keluaran OpenAI bukan JSON valid', 200, 'INVALID_OUTPUT', true, false);
    }
    const usedModel: string = typeof data?.model === 'string' && data.model ? data.model : this.model;
    const usage = data?.usage ?? {};
    return {
      json,
      text,
      requestedModel: this.model,
      usedModel,
      modelVersion: usedModel,
      thinkingLevel: effort,
      inputTokens: usage.input_tokens ?? null,
      outputTokens: usage.output_tokens ?? null,
      latencyMs,
      fallbacks: [],
    };
  }
}
