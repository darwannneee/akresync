import pg from 'pg';
import { getConfig } from '../config/index.js';

// numeric/bigint sebagai string agar tidak kehilangan presisi; konversi dilakukan eksplisit.
let pool: pg.Pool | undefined;

export function getPool(): pg.Pool {
  pool ??= new pg.Pool({ connectionString: getConfig().DATABASE_URL, max: 10 });
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) await pool.end();
  pool = undefined;
}

export type Queryable = Pick<pg.PoolClient, 'query'>;

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>, p: Pick<pg.Pool, 'connect'> = getPool()): Promise<T> {
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* abaikan */
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function q<T extends pg.QueryResultRow = any>(db: Queryable, text: string, params: unknown[] = []): Promise<T[]> {
  const r = await db.query<T>(text, params);
  return r.rows;
}

export async function q1<T extends pg.QueryResultRow = any>(db: Queryable, text: string, params: unknown[] = []): Promise<T | undefined> {
  return (await q<T>(db, text, params))[0];
}

/** jsonb/teks Postgres menolak karakter NUL; kunci komposit Fabric memakainya → ganti U+2400 (reversibel). */
const NUL = '\u0000';
const NUL_SUB = '␀';
export const toDbKey = (key: string): string => key.split(NUL).join(NUL_SUB);
export const fromDbKey = (key: string): string => key.split(NUL_SUB).join(NUL);
export function dbSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value).split('\\u0000').join(NUL_SUB)) as T;
}
