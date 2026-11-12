import type { NextFunction, Request, RequestHandler, Response, Router } from 'express';
import { randomUUID } from 'node:crypto';
import type { ApiEnvelope, AuditReceipt, ChainReceipt, RouteSpec } from '@akreditasi/shared';
import type { ZodTypeAny, z } from 'zod';
import { authorize } from '../auth/rbac.js';
import { badRequest } from '../errors.js';

export type Handler = (req: Request, res: Response) => Promise<unknown>;

export const asyncHandler =
  (fn: Handler): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw badRequest(r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '), r.error.issues);
  }
  return r.data;
}

export function envelope<T>(data: T, extra: { chain?: ChainReceipt; audit?: AuditReceipt } = {}): ApiEnvelope<T> {
  return { data, ...extra };
}

/** Pasang rute dengan RBAC dari spec API_ROUTES. `auth` = middleware autentikasi (dilewati untuk rute publik). */
export function mount(router: Router, auth: RequestHandler, spec: RouteSpec, ...handlers: Handler[]): void {
  mountWith(router, auth, spec, [], ...handlers);
}

/** Seperti mount, dengan middleware tambahan setelah RBAC (mis. multer untuk unggahan). */
export function mountWith(router: Router, auth: RequestHandler, spec: RouteSpec, middleware: RequestHandler[], ...handlers: Handler[]): void {
  const method = spec.method.toLowerCase() as 'get' | 'post' | 'put' | 'delete';
  const chain: RequestHandler[] = spec.roles === 'public' ? [] : [auth, authorize(spec)];
  router[method](spec.path, ...chain, ...middleware, ...handlers.map(asyncHandler));
}

/** requestId dari header Idempotency-Key (divalidasi) atau uuid baru. */
export function requestIdFrom(req: Request): string {
  const h = req.header('Idempotency-Key');
  if (h === undefined) return randomUUID();
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(h)) throw badRequest('Idempotency-Key harus 8-128 karakter [A-Za-z0-9._:-]');
  return h;
}

export const uuidParam = (v: unknown): string => {
  if (typeof v !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) throw badRequest('ID tidak valid');
  return v;
};

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Rute tidak ditemukan' } });
}

export function errorHandler(logger: { error: (o: object, m: string) => void }) {
  return (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const e = err as { status?: number; code?: string; message?: string; details?: unknown; name?: string };
    if (e?.name === 'AppError' || (typeof e?.status === 'number' && typeof e?.code === 'string')) {
      res.status(e.status as number).json({ error: { code: e.code, message: e.message, ...(e.details !== undefined ? { details: e.details } : {}) } });
      return;
    }
    if (e?.name === 'MulterError') {
      res.status(400).json({ error: { code: 'UPLOAD_ERROR', message: e.code === 'LIMIT_FILE_SIZE' ? 'Ukuran berkas melebihi 25 MB' : String(e.message) } });
      return;
    }
    if ((e as { type?: string })?.type === 'entity.parse.failed') {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'JSON tidak valid' } });
      return;
    }
    logger.error({ err }, 'kesalahan tak tertangani');
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Terjadi kesalahan pada server' } });
  };
}
