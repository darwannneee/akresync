import type { RequestHandler, Router } from 'express';
import { API_ROUTES } from '@akreditasi/shared';
import type { AppContext } from '../context.js';
import { q } from '../db/pool.js';
import { envelope, mount, uuidParam } from '../lib/http.js';
import { camel } from './common.js';

export function masterRoutes(ctx: AppContext, router: Router, auth: RequestHandler) {
  mount(router, auth, API_ROUTES.institutions, async (_req, res) => {
    res.json(envelope((await q(ctx.pool, 'SELECT id, name, pddikti_code, sakti_id FROM institutions ORDER BY name')).map(camel)));
  });
  mount(router, auth, API_ROUTES.programs, async (req, res) => {
    const id = uuidParam(req.params.institutionId);
    res.json(envelope((await q(ctx.pool, 'SELECT id, institution_id, name, level FROM study_programs WHERE institution_id=$1 ORDER BY name, level', [id])).map(camel)));
  });
  mount(router, auth, API_ROUTES.refLevels, async (_req, res) => {
    res.json(envelope((await q(ctx.pool, 'SELECT id, code, label FROM levels ORDER BY id')).map(camel)));
  });
  mount(router, auth, API_ROUTES.refProgramNames, async (_req, res) => {
    res.json(envelope((await q(ctx.pool, 'SELECT id, name FROM program_names ORDER BY name')).map(camel)));
  });
  mount(router, auth, API_ROUTES.assessors, async (_req, res) => {
    res.json(envelope((await q(ctx.pool, `SELECT id, full_name, email FROM users WHERE role='asesor' AND is_active ORDER BY full_name`)).map(camel)));
  });
}
