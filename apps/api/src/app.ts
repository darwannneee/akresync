import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Router, type Express } from 'express';
import helmet from 'helmet';
import { API_PREFIX } from '@akreditasi/shared';
import { authenticate } from './auth/rbac.js';
import { loadActiveUser } from './auth/users.js';
import type { AppContext } from './context.js';
import { errorHandler, notFoundHandler } from './lib/http.js';
import { logger } from './logger.js';
import { aiRoutes } from './modules/ai.js';
import { assessmentRoutes } from './modules/assessments.js';
import { assignmentRoutes } from './modules/assignments.js';
import { auditRoutes } from './modules/audit.js';
import { authRoutes } from './modules/auth.js';
import { finalizationRoutes } from './modules/finalization.js';
import { masterRoutes } from './modules/master.js';
import { paymentRoutes } from './modules/payments.js';
import { recordRoutes } from './modules/records.js';
import { responseRoutes } from './modules/responses.js';
import { scheduleRoutes } from './modules/schedules.js';
import { submissionRoutes } from './modules/submissions.js';
import { systemRoutes } from './modules/system.js';

export function createApp(ctx: AppContext): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: ctx.config.CORS_ORIGINS.split(',').map((s) => s.trim()), credentials: true, exposedHeaders: ['X-Chain-Verified', 'X-Decision-Tx', 'X-Content-Sha256', 'X-Integrity-Verified'] }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const load = (id: string) => loadActiveUser(ctx.pool, id);
  const auth = authenticate(load);
  const authSse = authenticate(load, true);

  const router = Router();
  authRoutes(ctx, router, auth);
  masterRoutes(ctx, router, auth);
  submissionRoutes(ctx, router, auth);
  paymentRoutes(ctx, router, auth);
  assignmentRoutes(ctx, router, auth);
  assessmentRoutes(ctx, router, auth);
  scheduleRoutes(ctx, router, auth);
  responseRoutes(ctx, router, auth);
  finalizationRoutes(ctx, router, auth);
  recordRoutes(ctx, router, auth);
  aiRoutes(ctx, router, auth);
  auditRoutes(ctx, router, auth);
  systemRoutes(ctx, router, auth, authSse);
  app.use(API_PREFIX, router);

  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
