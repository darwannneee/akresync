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
});

export type WorkerConfig = Omit<z.infer<typeof schema>, 'RETRY_BACKOFF_SECONDS' | 'KAFKA_BROKERS'> & { brokers: string[]; backoffMs: number[] };

export function parseConfig(env: NodeJS.ProcessEnv): WorkerConfig {
  const r = schema.safeParse(env);
  if (!r.success) throw new Error(`Konfigurasi tidak valid: ${r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  const { RETRY_BACKOFF_SECONDS, KAFKA_BROKERS, ...rest } = r.data;
  const backoffMs = RETRY_BACKOFF_SECONDS.split(',').map((s) => Number(s.trim()) * 1000);
  if (backoffMs.some((n) => !Number.isFinite(n) || n < 0)) throw new Error('RETRY_BACKOFF_SECONDS tidak valid');
  return { ...rest, brokers: KAFKA_BROKERS.split(',').map((s) => s.trim()), backoffMs };
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
