import { Kafka, logLevel, type Consumer } from 'kafkajs';
import pg from 'pg';
import pino from 'pino';
import { parseConfig } from './config.js';
import { dbDeps, sweepDeps } from './db.js';
import { AuditSubmitter } from './fabric.js';
import { isRebalanceError, makeEachMessage, withCooldown, type Deps } from './handler.js';
import { PERMANENT_SQL_PATTERN, sweepOnce } from './sweep.js';

const cfg = parseConfig(process.env);
const log = pino({ level: cfg.LOG_LEVEL });
const pool = new pg.Pool({ connectionString: cfg.DATABASE_URL, max: 8 });
const submitter = new AuditSubmitter(cfg);
const kafka = new Kafka({ clientId: 'audit-worker', brokers: cfg.brokers, logLevel: logLevel.WARN });
const producer = kafka.producer();
const admin = kafka.admin();
const TOPIC_RE = /^audit\.(?!dlq).+/;
const DLQ = 'audit.dlq';

let stopping = false;
// Dipasang saat consumer akan dimulai ulang (topik baru): menghentikan tunggu/jeda agar disconnect tidak menggantung.
let restarting = false;
let currentHeartbeat: () => Promise<void> = async () => undefined;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} melewati ${ms} ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

const deps: Deps = {
  ...dbDeps(pool),
  submitAudit: (e) => submitter.submitAudit(e),
  async publishDlq(key, value, error) {
    await producer.send({ topic: DLQ, messages: [{ key, value: value ?? null, headers: { error: error.slice(0, 500), failedAt: new Date().toISOString() } }] });
  },
  // Heartbeat selama menunggu retry agar sesi consumer tidak habis. Galat rebalance dilempar (tidak ditelan):
  // pesan ini tidak boleh terus diproses oleh consumer yang partisinya sudah dicabut; kafkajs memprosesnya ulang
  // setelah bergabung kembali. Galat heartbeat lain (mis. jaringan) hanya dicatat; bila sesi benar-benar habis,
  // heartbeat berikutnya melaporkan rebalance.
  async sleep(ms) {
    const end = Date.now() + ms;
    while (Date.now() < end && !stopping && !restarting) {
      await new Promise((r) => setTimeout(r, Math.min(1000, end - Date.now())));
      try {
        await currentHeartbeat();
      } catch (err) {
        if (isRebalanceError(err)) throw err;
        log.warn({ err: String(err) }, 'heartbeat gagal sementara');
      }
    }
  },
  backoffMs: cfg.backoffMs,
  isStopping: () => stopping || restarting,
  log,
};

async function matchingTopics(): Promise<string[]> {
  return (await withTimeout(admin.listTopics(), 10_000, 'listTopics')).filter((t) => TOPIC_RE.test(t)).sort();
}

async function runConsumer(): Promise<void> {
  for (;;) {
    const subscribed = await matchingTopics();
    restarting = false;
    const consumer: Consumer = kafka.consumer({ groupId: cfg.KAFKA_GROUP_ID, sessionTimeout: 60_000, heartbeatInterval: 5_000 });
    await consumer.connect();
    await consumer.subscribe({ topics: [TOPIC_RE], fromBeginning: true });
    const commit = (o: { topic: string; partition: number; offset: string }[]) => consumer.commitOffsets(o);
    const each = withCooldown(deps, makeEachMessage(deps, commit), commit, { maxCycles: cfg.maxCooldowns, cooldownMs: cfg.cooldownMs });
    await consumer.run({
      autoCommit: false,
      eachMessage: async ({ topic, partition, message, heartbeat }) => {
        currentHeartbeat = heartbeat;
        try {
          // Galat sementara: offset tidak di-commit dan pesan diproses lagi setelah jeda, paling banyak
          // RETRY_MAX_COOLDOWNS siklus; sesudahnya ditandai failed dan offset dilanjutkan (pemroses ulang mengambil alih).
          // kafkajs memproses satu partisi dalam satu waktu (partitionsConsumedConcurrently = 1), sehingga selama
          // pesan ini menunggu SELURUH konsumsi oleh instans ini tertahan; karena itu siklusnya dibatasi.
          await each({ topic, partition, key: message.key, value: message.value, offset: message.offset });
        } finally {
          currentHeartbeat = async () => undefined;
        }
      },
    });
    log.info({ topics: subscribed }, 'audit-worker berjalan');
    // Topik outbox baru (dibuat Debezium saat peristiwa pertama) butuh langganan ulang.
    let changed = false;
    while (!stopping && !changed) {
      await new Promise((r) => setTimeout(r, 15_000));
      if (stopping) break;
      const now = await matchingTopics().catch(() => subscribed);
      if (now.join() !== subscribed.join()) {
        log.info({ topics: now }, 'topik baru terdeteksi; memulai ulang consumer');
        changed = true;
      }
    }
    // `restarting` memutus jeda/tunggu pada pesan yang sedang berjalan agar disconnect tidak menggantung;
    // batas waktu menjaga proses tetap bergerak bila disconnect macet.
    restarting = true;
    await withTimeout(consumer.disconnect(), 30_000, 'disconnect consumer').catch((err) => log.warn({ err: String(err) }, 'disconnect consumer tidak bersih'));
    if (stopping) return;
  }
}

// Pemroses ulang berkala: baris audit_status yang `failed` karena galat sementara atau `pending` terlalu lama
// dikirim ulang dari outbox (idempoten per eventId), sehingga pengajuan tidak macet permanen.
const sweepRefs = sweepDeps(pool, PERMANENT_SQL_PATTERN, cfg.sweepMaxAttempts, cfg.sweepPendingAgeSeconds);
let sweeping = false;
const sweepTimer = setInterval(() => {
  if (sweeping || stopping) return;
  sweeping = true;
  sweepOnce(deps, sweepRefs)
    .then((r) => { if (r.tried) log.info(r, 'pemroses ulang audit selesai'); })
    .catch((err) => log.warn({ err: String(err) }, 'pemroses ulang audit gagal'))
    .finally(() => { sweeping = false; });
}, cfg.sweepIntervalMs);
sweepTimer.unref();

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
