import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { AppRole } from '@akreditasi/shared';
import type { Pool } from 'pg';
import { q1, withTransaction } from '../db/pool.js';
import { conflict } from '../errors.js';
import { enrollForAppRole, storeIdentity } from '../fabric/identity.js';
import type { AuthUser } from './types.js';

export const hashPassword = (p: string) => bcrypt.hash(p, 12);
export const verifyPassword = (p: string, h: string) => bcrypt.compare(p, h);

export const toAuthUser = (r: any): AuthUser => ({ id: r.id, role: r.role, email: r.email, fullName: r.full_name, institutionId: r.institution_id });

export async function loadActiveUser(pool: Pick<Pool, 'query'>, id: string): Promise<AuthUser | undefined> {
  const r = await q1(pool, 'SELECT id, role, email, full_name, institution_id FROM users WHERE id = $1 AND is_active', [id]);
  return r ? toAuthUser(r) : undefined;
}

export interface NewUser {
  email: string;
  password: string;
  fullName: string;
  role: AppRole;
  institutionId?: string | null;
}

/**
 * Buat pengguna; untuk peran dengan identitas Fabric, daftarkan+enroll di CA lebih dulu
 * (gagal enroll → pengguna tidak dibuat), lalu simpan pengguna + identitas dalam satu transaksi.
 */
export async function createUser(pool: Pool, u: NewUser, opts: { enroll?: boolean } = {}): Promise<AuthUser> {
  const email = u.email.trim().toLowerCase();
  if (await q1(pool, 'SELECT 1 FROM users WHERE email = $1', [email])) throw conflict('Email sudah terdaftar');
  const id = randomUUID();
  const identity = opts.enroll === false ? null : await enrollForAppRole(id, u.role);
  const passwordHash = await hashPassword(u.password);
  return withTransaction(async (c) => {
    const row = await q1(
      c,
      `INSERT INTO users (id, email, password_hash, full_name, role, institution_id) VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, role, email, full_name, institution_id`,
      [id, email, passwordHash, u.fullName, u.role, u.institutionId ?? null],
    );
    if (identity) await storeIdentity(c, id, identity);
    return toAuthUser(row);
  }, pool);
}
