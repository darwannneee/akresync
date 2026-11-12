import { Kafka, logLevel, type Consumer } from 'kafkajs';
import pg from 'pg';
import pino from 'pino';
import { parseConfig } from './config.js';
import { dbDeps } from './db.js';
import { AuditSubmitter } from './fabric.js';
import { makeEachMessage, type Deps } from './handler.js';

const cfg = parseConfig(process.env);
const log = pino({ level: cfg.LOG_LEVEL });
const pool = new pg.Pool({ connectionString: cfg.DATABASE_URL, max: 4 });
const submitter = new AuditSubmitter(cfg);
const kafka = new Kafka({ clientId: 'audit-worker', brokers: cfg.brokers, logLevel: logLevel.WARN });
const producer = kafka.producer();
const admin = kafka.admin();
const TOPIC_RE = /^audit\.(?!dlq).+/;
const DLQ = 'audit.dlq';

let stopping = false;
let currentHeartbeat: () => Promise<void> = async () => undefined;

const deps: Deps = {
  ...dbDeps(pool),
  submitAudit: (e) => submitter.submitAudit(e),
  async publishDlq(key, value, error) {
    await producer.send({ topic: DLQ, messages: [{ key, value: value ?? null, headers: { error: error.slice(0, 500), failedAt: new Date().toISOString() } }] });
  },
  // Heartbeat selama menunggu retry agar sesi consumer tidak habis.
  async sleep(ms) {
    const end = Date.now() + ms;
    while (Date.now() < end && !stopping) {
      await new Promise((r) => setTimeout(r, Math.min(1000, end - Date.now())));
      await currentHeartbeat().catch(() => undefined);
    }
  },
  backoffMs: cfg.backoffMs,
  log,
};

async function matchingTopics(): Promise<string[]> {
  return (await admin.listTopics()).filter((t) => TOPIC_RE.test(t)).sort();
}

async function runConsumer(): Promise<void> {
  let subscribed = await matchingTopics();
  const consumer: Consumer = kafka.consumer({ groupId: cfg.KAFKA_GROUP_ID, sessionTimeout: 60_000, heartbeatInterval: 5_000 });
  await consumer.connect();
  await consumer.subscribe({ topics: [TOPIC_RE], fromBeginning: true });
  const each = makeEachMessage(deps, (o) => consumer.commitOffsets(o));
  await consumer.run({
    autoCommit: false,
    eachMessage: async ({ topic, partition, message, heartbeat }) => {
      currentHeartbeat = heartbeat;
      await each({ topic, partition, key: message.key, value: message.value, offset: message.offset });
    },
  });
  log.info({ topics: subscribed }, 'audit-worker berjalan');
  // Topik outbox baru (dibuat Debezium saat peristiwa pertama) butuh langganan ulang.
  while (!stopping) {
    await new Promise((r) => setTimeout(r, 15_000));
    if (stopping) break;
    const now = await matchingTopics().catch(() => subscribed);
    if (now.join() !== subscribed.join()) {
      log.info({ topics: now }, 'topik baru terdeteksi; memulai ulang consumer');
      await consumer.disconnect();
      subscribed = now;
      return runConsumer();
    }
  }
  await consumer.disconnect();
}

async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  log.info({ signal }, 'mematikan audit-worker (menyelesaikan pesan berjalan)');
  setTimeout(() => process.exit(1), 30_000).unref();
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await producer.connect();
await admin.connect();
try {
  await runConsumer();
} finally {
  await producer.disconnect().catch(() => undefined);
  await admin.disconnect().catch(() => undefined);
  submitter.close();
  await pool.end();
  log.info('audit-worker berhenti');
  process.exit(0);
}
