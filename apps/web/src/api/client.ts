import type { ApiEnvelope, ApiError } from '@akreditasi/shared';

export const API_URL: string = (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:4000/api/v1').replace(/\/$/, '');

export class ApiRequestError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

let accessToken: string | null = null;
let onAuthLost: (() => void) | null = null;
export const getAccessToken = () => accessToken;
export const setAccessToken = (t: string | null) => { accessToken = t; };
export const setAuthLostHandler = (fn: (() => void) | null) => { onAuthLost = fn; };

export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });
}

/** snake_case → camelCase secara rekursif, kecuali isi payload/scores/snapshot/value yang bentuknya milik domain. */
const OPAQUE = new Set(['payload', 'scores', 'snapshot', 'value', 'result_data']);
function camel(v: unknown, opaque = false): unknown {
  if (Array.isArray(v)) return v.map((x) => camel(x, opaque));
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      const nk = opaque ? k : k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
      out[nk] = camel(val, opaque || OPAQUE.has(k) || OPAQUE.has(nk));
    }
    return out;
  }
  return v;
}

let refreshing: Promise<boolean> | null = null;
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Idempotency-Key': uuid() },
      });
      if (!res.ok) return false;
      const body = (await res.json()) as ApiEnvelope<{ accessToken: string }>;
      accessToken = body.data.accessToken;
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => { refreshing = null; }, 0);
    }
  })();
  return refreshing;
}

export interface RequestOptions {
  body?: unknown;
  form?: FormData;
  query?: Record<string, string | number | undefined>;
  noAuthRetry?: boolean;
}

async function raw(method: string, path: string, opts: RequestOptions, retried: boolean): Promise<Response> {
  const url = new URL(`${API_URL}${path}`);
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (method === 'POST' || method === 'PUT') headers['Idempotency-Key'] = uuid();
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(url, { method, headers, body, credentials: 'include' });
  } catch {
    throw new ApiRequestError(0, 'NETWORK', 'Tidak dapat terhubung ke server. Periksa koneksi Anda.');
  }
  if (res.status === 401 && !retried && !opts.noAuthRetry) {
    if (await refreshSession()) return raw(method, path, opts, true);
    onAuthLost?.();
  }
  return res;
}

async function fail(res: Response): Promise<never> {
  let code = 'HTTP_' + res.status;
  let message = `Permintaan gagal (${res.status}).`;
  let details: unknown;
  try {
    const j = (await res.json()) as Partial<ApiError>;
    if (j.error) { code = j.error.code; message = j.error.message; details = j.error.details; }
  } catch { /* abaikan */ }
  throw new ApiRequestError(res.status, code, message, details);
}

export async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<ApiEnvelope<T>> {
  const res = await raw(method, path, opts, false);
  if (!res.ok) return fail(res);
  if (res.status === 204) return { data: undefined as T };
  const j = (await res.json()) as ApiEnvelope<T>;
  return camel(j) as ApiEnvelope<T>;
}

export const api = {
  get: <T>(path: string, query?: RequestOptions['query']) => request<T>('GET', path, { query }),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, { body }),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body }),
  upload: <T>(path: string, form: FormData) => request<T>('POST', path, { form }),
};

export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const res = await raw('GET', path, {}, false);
  if (!res.ok) return fail(res);
  const blob = await res.blob();
  const cd = res.headers.get('content-disposition') ?? '';
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
  const name = m?.[1] ? decodeURIComponent(m[1]) : fallbackName;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

export const errorMessage = (e: unknown): string =>
  e instanceof ApiRequestError ? e.message : e instanceof Error ? e.message : 'Terjadi kesalahan tak terduga.';

/** Ambil berkas terautentikasi sebagai Blob (untuk pratinjau di tab baru atau gambar). */
export async function fetchBlob(path: string): Promise<Blob> {
  const res = await raw('GET', path, {}, false);
  if (!res.ok) return fail(res);
  return res.blob();
}
