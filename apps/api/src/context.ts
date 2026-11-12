import type { Pool } from 'pg';
import type { ChainClient } from './fabric/gateway.js';
import type { IpfsClient } from './ipfs/client.js';
import type { SseHub } from './sse/hub.js';
import type { AiService } from './ai/service.js';
import type { Config } from './config/index.js';

export interface AppContext {
  config: Config;
  pool: Pool;
  chain: ChainClient;
  ipfs: IpfsClient;
  hub: SseHub;
  ai: AiService;
  checkKafka: () => Promise<boolean>;
}
