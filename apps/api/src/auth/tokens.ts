import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { APP_ROLES, type AppRole } from '@akreditasi/shared';
import { getConfig } from '../config/index.js';
import { unauthorized } from '../errors.js';

export interface AccessClaims {
  sub: string;
  role: AppRole;
  email: string;
}

export function signAccessToken(c: AccessClaims, secret = getConfig().JWT_SECRET, ttlSeconds = getConfig().ACCESS_TOKEN_TTL_SECONDS): string {
  return jwt.sign({ role: c.role, email: c.email }, secret, { subject: c.sub, expiresIn: ttlSeconds, algorithm: 'HS256' });
}

export function verifyAccessToken(token: string, secret = getConfig().JWT_SECRET): AccessClaims {
  try {
    const p = jwt.verify(token, secret, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    if (!p.sub || typeof p.role !== 'string' || !(APP_ROLES as readonly string[]).includes(p.role)) throw new Error('klaim tidak valid');
    return { sub: p.sub, role: p.role as AppRole, email: String(p.email ?? '') };
  } catch {
    throw unauthorized('Token tidak valid atau kedaluwarsa');
  }
}

export const newRefreshToken = (): string => randomBytes(48).toString('base64url');
export const hashRefreshToken = (t: string): string => createHash('sha256').update(t).digest('hex');
