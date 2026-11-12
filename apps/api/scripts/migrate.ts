import { closePool, getPool } from '../src/db/pool.js';
import { runMigrations } from '../src/db/migrate.js';

const applied = await runMigrations(getPool());
console.log(applied.length ? `Diterapkan: ${applied.join(', ')}` : 'Tidak ada migrasi baru');
await closePool();
