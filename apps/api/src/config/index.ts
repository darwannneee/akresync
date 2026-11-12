import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const key32 = z
  .string()
  .min(1, 'wajib diisi')
  .transform((v, ctx) => {
    const raw = /^[0-9a-fA-F]{64}$/.test(v) ? Buffer.from(v, 'hex') : Buffer.from(v, 'base64');
    if (raw.length !== 32) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'kunci master harus 32 byte (base64 atau hex 64 karakter)' });
      return z.NEVER;
    }
    return raw;
  });

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.string().default('info'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET minimal 32 karakter'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  COOKIE_SECURE: bool,
  DOCUMENT_MASTER_KEY: key32,
  IDENTITY_MASTER_KEY: key32,
  IPFS_API_URL: z.string().url().default('http://127.0.0.1:5001'),
  FABRIC_NETWORK_FILE: z.string().default('../../.runtime/fabric/network.json'),
  AUDIT_IDENTITY_DIR: z.string().default('../../.runtime/fabric/audit-identity'),
  KAFKA_BROKERS: z.string().default('127.0.0.1:9092'),
  RECONCILER_INTERVAL_MS: z.coerce.number().int().positive().default(30000),
  RECONCILER_PENDING_AFTER_MS: z.coerce.number().int().positive().default(60000),
  SEED_ACCOUNTS_FILE: z.string().default('../../.runtime/seed-accounts.json'),
  MIGRATIONS_DIR: z.string().default('../../db/migrations'),
  // Modul AI pendukung keputusan
  GEMINI_API_KEY: z.string().optional().transform((v) => v?.trim() || undefined),
  GEMINI_MODEL: z.string().min(1).default('gemini-3.6-flash'),
  GEMINI_FALLBACK_MODELS: z
    .string()
    .default('')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),
  GEMINI_EMBED_MODEL: z.string().min(1).default('gemini-embedding-001'),
  AI_EMBED_DIM: z.coerce.number().int().min(64).max(2000).default(768),
  GEMINI_THINKING_LEVEL: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
  EMBEDDING_PROVIDER: z.enum(['local', 'gemini']).default('local'),
  EMBEDDING_MODEL: z.string().min(1).default('Xenova/multilingual-e5-base'),
  EMBEDDING_CACHE_DIR: z.string().default('../../.runtime/models'),
  AI_EMBED_BATCH: z.coerce.number().int().min(1).max(64).default(16),
  AI_EMBED_RPM: z.coerce.number().positive().default(80),
  AI_MAX_CONTEXT_TOKENS: z.coerce.number().int().positive().default(120000),
  AI_RPM: z.coerce.number().positive().default(4),
  AI_RETRY_DELAYS_MS: z
    .string()
    .default('10000,30000,60000,120000,240000')
    .transform((v) => v.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n >= 0)),
  AI_JOB_MAX_ATTEMPTS: z.coerce.number().int().positive().default(4),
  AI_AUTO_ANALYSIS: z.string().optional().transform((v) => v !== 'false' && v !== '0'),
  AI_AUTO_MAX_PER_DAY: z.coerce.number().int().positive().default(12),
  AI_JOBS_ENABLED: z.string().optional().transform((v) => v !== 'false' && v !== '0'),
});

export type Config = z.infer<typeof schema>;

export function parseConfig(env: NodeJS.ProcessEnv): Config {
  const result = schema.safeParse(env);
  if (!result.success) {
    const msg = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Konfigurasi tidak valid: ${msg}`);
  }
  return result.data;
}

let cached: Config | undefined;
export function getConfig(): Config {
  cached ??= parseConfig(process.env);
  return cached;
}

/** Path relatif dihitung dari direktori apps/api (cwd saat menjalankan skrip pnpm --filter). */
export function resolvePath(p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}

export interface OrgNetwork {
  peerEndpoint: string;
  peerHostAlias: string;
  peerTlsCaPath: string;
  caUrl: string;
  caName: string;
  caTlsCertPath: string;
  registrarId: string;
  registrarSecret: string;
}
export interface NetworkFile {
  channel: string;
  chaincode: string;
  orgs: Record<string, OrgNetwork>;
}

const orgSchema = z.object({
  peerEndpoint: z.string(),
  peerHostAlias: z.string(),
  peerTlsCaPath: z.string(),
  caUrl: z.string(),
  caName: z.string(),
  caTlsCertPath: z.string(),
  registrarId: z.string(),
  registrarSecret: z.string(),
});
const networkSchema = z.object({ channel: z.string(), chaincode: z.string(), orgs: z.record(orgSchema) });

export function loadNetwork(cfg: Config = getConfig()): NetworkFile {
  const file = resolvePath(cfg.FABRIC_NETWORK_FILE);
  if (!existsSync(file)) throw new Error(`network.json Fabric tidak ditemukan: ${file}`);
  return networkSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
}
