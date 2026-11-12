import net from 'node:net';
import type { RequestHandler, Router } from 'express';
import { API_ROUTES } from '@akreditasi/shared';
import type { AppContext } from '../context.js';
import { envelope, mount } from '../lib/http.js';

export function tcpReachable(hostPort: string, timeoutMs = 2000): Promise<boolean> {
  const [host, port] = hostPort.split(':');
  return new Promise((resolve) => {
    const s = net.connect({ host: host ?? '127.0.0.1', port: Number(port ?? 9092) });
    const done = (ok: boolean) => {
      s.destroy();
      resolve(ok);
    };
    s.setTimeout(timeoutMs, () => done(false));
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
  });
}

export function systemRoutes(ctx: AppContext, router: Router, auth: RequestHandler, authSse: RequestHandler) {
  mount(router, auth, API_ROUTES.health, async (_req, res) => {
    const [db, ipfs, fabric, kafka] = await Promise.all([
      ctx.pool.query('SELECT 1').then(() => true, () => false),
      ctx.ipfs.ping(),
      ctx.chain.ping(),
      ctx.checkKafka(),
    ]);
    const ok = db && ipfs && fabric && kafka;
    res.status(ok ? 200 : 503).json(envelope({ status: ok ? 'ok' : 'degraded', db, ipfs, fabric, kafka }));
  });

  // SSE memakai ?token= (EventSource tidak bisa mengirim header Authorization).
  mount(router, authSse, API_ROUTES.eventStream, async (req, res) => {
    ctx.hub.add(req.user!, res);
  });
}
