import type { CookieOptions, Request, Response, Router } from 'express';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { API_ROUTES } from '@akreditasi/shared';
import { hashRefreshToken, newRefreshToken, signAccessToken } from '../auth/tokens.js';
import { createUser, loadActiveUser, toAuthUser, verifyPassword } from '../auth/users.js';
import type { AppContext } from '../context.js';
import { q1 } from '../db/pool.js';
import { badRequest, unauthorized } from '../errors.js';
import { envelope, mount, parse } from '../lib/http.js';

const COOKIE = 'refresh_token';

const registerSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(10, 'minimal 10 karakter').max(200),
  fullName: z.string().trim().min(2).max(200),
  institutionId: z.string().uuid(),
  programId: z.string().uuid().optional(),
});
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

export function authRoutes(ctx: AppContext, router: Router, auth: RequestHandler) {
  const cookieOpts = (): CookieOptions => ({
    httpOnly: true,
    sameSite: 'lax',
    secure: ctx.config.COOKIE_SECURE,
    path: '/api/v1/auth',
    maxAge: ctx.config.REFRESH_TOKEN_TTL_DAYS * 86400 * 1000,
  });

  async function institutionName(id: string | null): Promise<string | null> {
    if (!id) return null;
    return (await q1<{ name: string }>(ctx.pool, 'SELECT name FROM institutions WHERE id=$1', [id]))?.name ?? null;
  }

  async function issueSession(res: Response, user: ReturnType<typeof toAuthUser>) {
    const refresh = newRefreshToken();
    await ctx.pool.query(`INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1,$2, now() + ($3 || ' days')::interval)`, [
      user.id,
      hashRefreshToken(refresh),
      String(ctx.config.REFRESH_TOKEN_TTL_DAYS),
    ]);
    res.cookie(COOKIE, refresh, cookieOpts());
    return {
      accessToken: signAccessToken({ sub: user.id, role: user.role, email: user.email }),
      expiresIn: ctx.config.ACCESS_TOKEN_TTL_SECONDS,
      user: { ...user, institutionName: await institutionName(user.institutionId) },
    };
  }

  mount(router, auth, API_ROUTES.register, async (req, res) => {
    const b = parse(registerSchema, req.body);
    if (!(await q1(ctx.pool, 'SELECT 1 FROM institutions WHERE id=$1', [b.institutionId]))) throw badRequest('Institusi tidak ditemukan');
    const user = await createUser(ctx.pool, { email: b.email, password: b.password, fullName: b.fullName, role: 'upps', institutionId: b.institutionId });
    res.status(201).json(envelope(await issueSession(res, user)));
  });

  mount(router, auth, API_ROUTES.login, async (req, res) => {
    const b = parse(loginSchema, req.body);
    const row = await q1(ctx.pool, 'SELECT id, role, email, full_name, institution_id, password_hash, is_active FROM users WHERE email = $1', [b.email.trim().toLowerCase()]);
    // Selalu jalankan perbandingan agar waktu respons tidak membedakan email terdaftar.
    const ok = await verifyPassword(b.password, row?.password_hash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv');
    if (!row || !row.is_active || !ok) throw unauthorized('Email atau kata sandi salah');
    res.json(envelope(await issueSession(res, toAuthUser(row))));
  });

  mount(router, auth, API_ROUTES.refresh, async (req: Request, res) => {
    const token = req.cookies?.[COOKIE] as string | undefined;
    if (!token) throw unauthorized('Refresh token tidak ada');
    const hash = hashRefreshToken(token);
    // Rotasi: cabut token lama secara atomik; token yang sudah dicabut tidak bisa dipakai lagi.
    const row = await q1<{ user_id: string }>(
      ctx.pool,
      `UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now() RETURNING user_id`,
      [hash],
    );
    if (!row) {
      res.clearCookie(COOKIE, { ...cookieOpts(), maxAge: undefined });
      throw unauthorized('Refresh token tidak valid');
    }
    const user = await loadActiveUser(ctx.pool, row.user_id);
    if (!user) throw unauthorized('Akun tidak aktif');
    res.json(envelope(await issueSession(res, user)));
  });

  mount(router, auth, API_ROUTES.logout, async (req, res) => {
    const token = req.cookies?.[COOKIE] as string | undefined;
    if (token) await ctx.pool.query('UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [hashRefreshToken(token)]);
    res.clearCookie(COOKIE, { ...cookieOpts(), maxAge: undefined });
    res.json(envelope({ ok: true }));
  });

  mount(router, auth, API_ROUTES.me, async (req, res) => {
    const u = req.user!;
    const fabric = await q1(ctx.pool, 'SELECT msp_id, fabric_role FROM fabric_identities WHERE user_id = $1', [u.id]);
    res.json(envelope({ ...u, institutionName: await institutionName(u.institutionId), fabric: fabric ? { mspId: fabric.msp_id, role: fabric.fabric_role } : null }));
  });
}
