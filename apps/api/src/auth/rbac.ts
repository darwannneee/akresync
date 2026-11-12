import type { NextFunction, Request, Response } from 'express';
import type { AppRole, RouteSpec } from '@akreditasi/shared';
import { forbidden, notFound, unauthorized } from '../errors.js';
import { verifyAccessToken } from './tokens.js';
import { q1, type Queryable } from '../db/pool.js';
import type { AuthUser } from './types.js';

export function isRoleAllowed(roles: RouteSpec['roles'], role: AppRole | undefined): boolean {
  if (roles === 'public') return true;
  if (!role) return false;
  if (roles === 'authenticated') return true;
  return roles.includes(role);
}

/** Muat pengguna dari Bearer token (atau ?token= untuk SSE bila `allowQueryToken`). */
export function authenticate(loadUser: (id: string) => Promise<AuthUser | undefined>, allowQueryToken = false) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const header = req.headers.authorization;
      let token: string | undefined;
      if (header?.startsWith('Bearer ')) token = header.slice(7);
      else if (allowQueryToken && typeof req.query.token === 'string') token = req.query.token;
      if (!token) throw unauthorized();
      const claims = verifyAccessToken(token);
      const user = await loadUser(claims.sub);
      if (!user) throw unauthorized('Akun tidak aktif');
      req.user = user;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** RBAC dari definisi rute di shared (API_ROUTES). */
export function authorize(spec: RouteSpec) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (spec.roles === 'public') return next();
    if (!req.user) return next(unauthorized());
    if (!isRoleAllowed(spec.roles, req.user.role)) return next(forbidden(`Peran ${req.user.role} tidak diizinkan untuk aksi ini`));
    next();
  };
}

export interface SubmissionAccessRow {
  id: string;
  upps_user_id: string;
}

/** Aturan kepemilikan murni (dapat diuji): UPPS hanya miliknya, asesor hanya bila ada di penawaran. */
export function canViewSubmission(user: Pick<AuthUser, 'id' | 'role'>, sub: SubmissionAccessRow, assessorOfferedIds: string[]): boolean {
  switch (user.role) {
    case 'upps':
      return sub.upps_user_id === user.id;
    case 'asesor':
      return assessorOfferedIds.includes(user.id);
    default:
      return true;
  }
}

export interface SubmissionRow extends SubmissionAccessRow {
  stage: string;
  ak_status: string;
  al_schedule_status: string;
  document_set_version: number;
  institution_id: string;
  program_id: string;
  [k: string]: any;
}

export async function loadSubmissionForUser<T extends SubmissionAccessRow = SubmissionRow>(
  db: Queryable,
  user: AuthUser,
  submissionId: string,
  opts: { forUpdate?: boolean } = {},
): Promise<T> {
  if (!/^[0-9a-f-]{36}$/i.test(submissionId)) throw notFound('Pengajuan tidak ditemukan');
  const sub = await q1<T>(db, `SELECT * FROM submissions WHERE id = $1 ${opts.forUpdate ? 'FOR UPDATE' : ''}`, [submissionId]);
  if (!sub) throw notFound('Pengajuan tidak ditemukan');
  let offered: string[] = [];
  if (user.role === 'asesor') {
    const r = await db.query<{ a: string }>(
      `SELECT assessor1_id AS a FROM assessor_offers WHERE submission_id=$1 UNION SELECT assessor2_id FROM assessor_offers WHERE submission_id=$1`,
      [submissionId],
    );
    offered = r.rows.map((x) => x.a);
  }
  // Tidak membocorkan keberadaan pengajuan milik pihak lain.
  if (!canViewSubmission(user, sub, offered)) throw notFound('Pengajuan tidak ditemukan');
  return sub;
}
