import type { AiFallbackAttempt } from '@akreditasi/shared';

/** Galat dari penyedia AI. `retryable` = layak dicoba ulang; `fallbackable` = layak pindah ke model cadangan. */
export class AiProviderError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly code: string,
    public readonly retryable: boolean,
    public readonly fallbackable: boolean,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}

export interface GenerateResult {
  json: unknown;
  text: string;
  requestedModel: string;
  /** Model yang benar-benar menjawab (dari modelVersion respons; Google dapat mengalihkan). */
  usedModel: string;
  modelVersion: string | null;
  thinkingLevel: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  fallbacks: AiFallbackAttempt[];
}

export interface GenerateOptions {
  /** Percobaan per model (menimpa bawaan). */
  attempts?: number;
  timeoutMs?: number;
  thinkingLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  generateJson(prompt: string, schema: object, opts?: GenerateOptions): Promise<GenerateResult>;
}

export type Sleep = (ms: number) => Promise<void>;
export const realSleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Pembatas laju sederhana: jarak minimal antar-permintaan = 60000 / rpm. */
export class RateLimiter {
  private nextAt = 0;
  constructor(
    private readonly rpm: number,
    private readonly sleep: Sleep = realSleep,
    private readonly now: () => number = Date.now,
  ) {}
  /** `weight` = jumlah permintaan yang dihitung (mis. jumlah teks dalam satu batch embedding). */
  async acquire(weight = 1): Promise<void> {
    const gap = (60000 / this.rpm) * weight;
    const t = this.now();
    const start = Math.max(t, this.nextAt);
    // Jarak diterapkan SETELAH permintaan ini: permintaan berikutnya menunggu sesuai bobot permintaan ini.
    this.nextAt = start + gap;
    if (start > t) await this.sleep(start - t);
  }
}

export interface RetryOptions {
  attempts: number;
  /** Jeda tunggu dari server (retryAfter) di atas batas ini tidak ditunggu di dalam proses: galat dilempar agar job menjadwalkan ulang. */
  maxInlineWaitMs?: number;
  baseDelayMs: number;
  sleep?: Sleep;
  /** jitter 0..1 dari penundaan (0 untuk uji deterministik). */
  jitter?: number;
}

/** Retry backoff eksponensial + jitter untuk AiProviderError.retryable. Galat lain dilempar langsung. */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions): Promise<T> {
  const sleep = opts.sleep ?? realSleep;
  let last: unknown;
  for (let i = 1; i <= opts.attempts; i++) {
    try {
      return await fn(i);
    } catch (err) {
      last = err;
      if (!(err instanceof AiProviderError) || !err.retryable || i === opts.attempts) throw err;
      if ((err.retryAfterMs ?? 0) > (opts.maxInlineWaitMs ?? 90_000)) throw err;
      const exp = opts.baseDelayMs * 2 ** (i - 1);
      const delay = Math.max(err.retryAfterMs ?? 0, exp) * (1 + (opts.jitter ?? 0.2) * Math.random());
      await sleep(delay);
    }
  }
  throw last;
}

/** Urutan job-level: jeda ke-n (dari daftar), ditambah jitter. */
export function jobRetryDelay(delays: number[], attempt: number, retryAfterMs = 0): number {
  const base = Math.max(delays[Math.min(attempt - 1, delays.length - 1)] ?? 30000, Math.min(retryAfterMs, 30 * 60_000));
  return Math.round(base * (1 + 0.2 * Math.random()));
}

export function friendlyAiError(err: unknown): string {
  if (err instanceof AiProviderError) {
    if (err.code === 'UNAVAILABLE' || err.status === 503) return 'Layanan AI sedang sibuk. Sistem sudah mencoba beberapa kali; silakan coba lagi beberapa menit lagi.';
    if (err.code === 'DAILY_QUOTA') return 'Kuota harian layanan AI telah habis. Analisis dapat dicoba lagi besok; penilaian manual tetap dapat dilakukan.';
    if (err.code === 'RESOURCE_EXHAUSTED' || err.status === 429) return 'Batas pemakaian layanan AI sedang tercapai. Silakan coba lagi beberapa menit lagi.';
    if (err.code === 'NOT_CONFIGURED') return 'Layanan AI belum dikonfigurasi pada server ini.';
    if (err.code === 'INVALID_OUTPUT') return 'Keluaran AI tidak dapat dipakai. Silakan minta analisis ulang.';
    if (err.status === 401 || err.status === 403) return 'Layanan AI menolak kredensial server. Hubungi administrator sistem.';
    return 'Layanan AI tidak dapat memproses permintaan saat ini. Silakan coba lagi nanti.';
  }
  return 'Analisis AI gagal diproses. Silakan coba lagi nanti.';
}
