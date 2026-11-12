import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { AppRole } from '@akreditasi/shared';
import type { Pool } from 'pg';
import { q1, withTransaction, type Queryable } from '../db/pool.js';
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

/** Sisipkan baris pengguna. status != 'active' → akun nonaktif (menunggu verifikasi / ditolak). */
export async function insertUserRow(
  db: Queryable,
  u: { id: string; email: string; passwordHash: string; fullName: string; role: AppRole; institutionId?: string | null; status?: 'active' | 'pending_verification' | 'rejected' },
) {
  const status = u.status ?? 'active';
  return q1(
    db,
    `INSERT INTO users (id, email, password_hash, full_name, role, institution_id, is_active, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id, role, email, full_name, institution_id`,
    [u.id, u.email, u.passwordHash, u.fullName, u.role, u.institutionId ?? null, status === 'active', status],
  );
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
    const row = await insertUserRow(c, { id, email, passwordHash, fullName: u.fullName, role: u.role, institutionId: u.institutionId });
    if (identity) await storeIdentity(c, id, identity);
    return toAuthUser(row);
  }, pool);
}
