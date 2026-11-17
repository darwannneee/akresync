import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const schema = z.object({
  LOG_LEVEL: z.string().default('info'),
  DATABASE_URL: z.string().min(1),
  KAFKA_BROKERS: z.string().default('127.0.0.1:9092'),
  KAFKA_GROUP_ID: z.string().default('audit-worker'),
  FABRIC_NETWORK_FILE: z.string().default('../../.runtime/fabric/network.json'),
  AUDIT_IDENTITY_DIR: z.string().default('../../.runtime/fabric/audit-identity'),
  RETRY_BACKOFF_SECONDS: z.string().default('1,2,4,8,16'),
  RETRY_COOLDOWN_SECONDS: z.coerce.number().positive().default(30),
  /** Maksimum siklus jeda untuk galat sementara dalam satu pesan; setelahnya `failed` dan diserahkan ke pemroses ulang. */
  RETRY_MAX_COOLDOWNS: z.coerce.number().int().positive().default(10),
  SWEEP_INTERVAL_SECONDS: z.coerce.number().positive().default(60),
  SWEEP_PENDING_AGE_SECONDS: z.coerce.number().positive().default(300),
  SWEEP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(30),
});

export type WorkerConfig = Omit<z.infer<typeof schema>, 'RETRY_BACKOFF_SECONDS' | 'KAFKA_BROKERS' | 'RETRY_COOLDOWN_SECONDS' | 'RETRY_MAX_COOLDOWNS' | 'SWEEP_INTERVAL_SECONDS' | 'SWEEP_PENDING_AGE_SECONDS' | 'SWEEP_MAX_ATTEMPTS'> & { brokers: string[]; backoffMs: number[]; cooldownMs: number; maxCooldowns: number; sweepIntervalMs: number; sweepPendingAgeSeconds: number; sweepMaxAttempts: number };

export function parseConfig(env: NodeJS.ProcessEnv): WorkerConfig {
  const r = schema.safeParse(env);
  if (!r.success) throw new Error(`Konfigurasi tidak valid: ${r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  const { RETRY_BACKOFF_SECONDS, KAFKA_BROKERS, RETRY_COOLDOWN_SECONDS, RETRY_MAX_COOLDOWNS, SWEEP_INTERVAL_SECONDS, SWEEP_PENDING_AGE_SECONDS, SWEEP_MAX_ATTEMPTS, ...rest } = r.data;
  const backoffMs = RETRY_BACKOFF_SECONDS.split(',').map((s) => Number(s.trim()) * 1000);
  if (backoffMs.some((n) => !Number.isFinite(n) || n < 0)) throw new Error('RETRY_BACKOFF_SECONDS tidak valid');
  return {
    ...rest,
    brokers: KAFKA_BROKERS.split(',').map((s) => s.trim()),
    backoffMs,
    cooldownMs: RETRY_COOLDOWN_SECONDS * 1000,
    maxCooldowns: RETRY_MAX_COOLDOWNS,
    sweepIntervalMs: SWEEP_INTERVAL_SECONDS * 1000,
    sweepPendingAgeSeconds: SWEEP_PENDING_AGE_SECONDS,
    sweepMaxAttempts: SWEEP_MAX_ATTEMPTS,
  };
}

export const resolvePath = (p: string) => (path.isAbsolute(p) ? p : path.resolve(process.cwd(), p));

export const MSP_SEKRETARIAT = 'SekretariatMSP';

export function loadNetwork(file: string) {
  const net = JSON.parse(readFileSync(resolvePath(file), 'utf8')) as {
    channel: string;
    chaincode: string;
    orgs: Record<string, { peerEndpoint: string; peerHostAlias: string; peerTlsCaPath: string }>;
  };
  const org = net.orgs[MSP_SEKRETARIAT];
  if (!org) throw new Error(`Org ${MSP_SEKRETARIAT} tidak ada di network.json`);
  return { channel: net.channel, chaincode: net.chaincode, org };
}
