import type { Response } from 'express';
import pg from 'pg';
import type { Pool } from 'pg';
import type { AuthUser } from '../auth/types.js';
import { canViewSubmission } from '../auth/rbac.js';
import { logger } from '../logger.js';

interface Client {
  user: AuthUser;
  res: Response;
}

export interface SseHub {
  start(): Promise<void>;
  stop(): Promise<void>;
  add(user: AuthUser, res: Response): void;
}

export function createSseHub(pool: Pool, connectionString: string): SseHub {
  const clients = new Set<Client>();
  let listener: pg.Client | undefined;
  let stopped = false;
  let heartbeat: NodeJS.Timeout | undefined;
  let retry: NodeJS.Timeout | undefined;

  async function visible(user: AuthUser, submissionId: string | null): Promise<boolean> {
    if (!submissionId) return user.role !== 'upps' && user.role !== 'asesor';
    const sub = (await pool.query<{ id: string; upps_user_id: string }>('SELECT id, upps_user_id FROM submissions WHERE id=$1', [submissionId])).rows[0];
    if (!sub) return false;
    let offered: string[] = [];
    if (user.role === 'asesor') {
      offered = (await pool.query<{ a: string }>(`SELECT assessor1_id AS a FROM assessor_offers WHERE submission_id=$1 UNION SELECT assessor2_id FROM assessor_offers WHERE submission_id=$1`, [submissionId])).rows.map((r) => r.a);
    }
    return canViewSubmission(user, sub, offered);
  }

  async function dispatch(channel: string, raw: string) {
    let data: { submissionId?: string | null };
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    for (const c of [...clients]) {
      try {
        if (await visible(c.user, data.submissionId ?? null)) c.res.write(`event: ${channel}\ndata: ${raw}\n\n`);
      } catch (err) {
        logger.warn({ err }, 'gagal mengirim SSE');
      }
    }
  }

  async function connect() {
    if (stopped) return;
    const client = new pg.Client({ connectionString });
    client.on('notification', (m) => void dispatch(m.channel, m.payload ?? '{}'));
    client.on('error', (err) => {
      logger.error({ err }, 'listener Postgres error; mencoba lagi');
      schedule();
    });
    client.on('end', schedule);
    try {
      await client.connect();
      await client.query('LISTEN audit_status');
      await client.query('LISTEN record_committed');
      listener = client;
    } catch (err) {
      logger.error({ err }, 'gagal LISTEN');
      client.end().catch(() => undefined);
      schedule();
    }
  }
  function schedule() {
    if (stopped || retry) return;
    listener = undefined;
    retry = setTimeout(() => {
      retry = undefined;
      void connect();
    }, 3000);
  }

  return {
    async start() {
      await connect();
      heartbeat = setInterval(() => {
        for (const c of clients) c.res.write(': ping\n\n');
      }, 25_000);
    },
    async stop() {
      stopped = true;
      if (heartbeat) clearInterval(heartbeat);
      if (retry) clearTimeout(retry);
      for (const c of clients) c.res.end();
      clients.clear();
      await listener?.end().catch(() => undefined);
    },
    add(user, res) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write('retry: 3000\n\n');
      const c = { user, res };
      clients.add(c);
      res.on('close', () => clients.delete(c));
    },
  };
}
