import { getConfig } from './config/index.js';
import { createApp } from './app.js';
import { closePool, getPool } from './db/pool.js';
import { FabricChainClient } from './fabric/gateway.js';
import { createIpfsClient } from './ipfs/client.js';
import { logger } from './logger.js';
import { tcpReachable } from './modules/system.js';
import { startReconciler } from './reconciler/index.js';
import { createSseHub } from './sse/hub.js';
import type { AppContext } from './context.js';

const config = getConfig();
const pool = getPool();
const chain = new FabricChainClient();
const hub = createSseHub(pool, config.DATABASE_URL);
const ctx: AppContext = {
  config,
  pool,
  chain,
  ipfs: createIpfsClient(),
  hub,
  checkKafka: async () => (await Promise.all(config.KAFKA_BROKERS.split(',').map((b) => tcpReachable(b.trim())))).some(Boolean),
};

await hub.start();
const stopReconciler = startReconciler(ctx);
const server = createApp(ctx).listen(config.PORT, () => logger.info({ port: config.PORT }, 'API berjalan'));

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'mematikan server');
  stopReconciler();
  await hub.stop();
  server.close();
  chain.close();
  await closePool();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
