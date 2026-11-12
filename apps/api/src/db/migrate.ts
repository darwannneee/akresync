import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Pool } from 'pg';
import { getConfig, resolvePath } from '../config/index.js';
import { logger } from '../logger.js';

export async function runMigrations(pool: Pool, dir = resolvePath(getConfig().MIGRATIONS_DIR)): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query('SELECT pg_advisory_lock(727001)');
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const done = new Set((await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    // Basis data yang sudah dibuat skrip lain (mis. infra) tanpa schema_migrations: deteksi 001.
    const hasUsers = (await client.query(`SELECT to_regclass('public.users') AS t`)).rows[0]?.t;
    if (hasUsers && !done.has('001_init.sql')) {
      await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', ['001_init.sql']);
      done.add('001_init.sql');
    }
    for (const f of files) {
      if (done.has(f)) continue;
      const sql = readFileSync(path.join(dir, f), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [f]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migrasi ${f} gagal: ${(err as Error).message}`);
      }
      applied.push(f);
      logger.info({ migration: f }, 'migrasi diterapkan');
    }
    return applied;
  } finally {
    await client.query('SELECT pg_advisory_unlock(727001)').catch(() => undefined);
    client.release();
  }
}
