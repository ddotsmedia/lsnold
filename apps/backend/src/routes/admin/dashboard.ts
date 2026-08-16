import express from 'express';
import type { Pool } from 'pg';
import { authenticate, createResolveAdmin, requireAdmin } from '../../middleware/auth.js';
import { createResolvePermissions, requirePermission, requirePanelAccess } from '../../middleware/permissions.js';
import type { AuthRequest } from '../../middleware/auth.js';
import * as c from '../../controllers/dashboardController.js';

export function createAdminDashboardRouter(db: Pool): express.Router {
  const router = express.Router();
  const resolveAdmin = createResolveAdmin(db);

  router.use(authenticate, resolveAdmin, createResolvePermissions(db), requirePanelAccess);

  router.get('/stats', requirePermission('view:dashboard'), (req, res) => c.getDashboardStats(db, req as AuthRequest, res));
  router.get('/page-views', requirePermission('view:dashboard'), (req, res) => c.getPageViews(db, req as AuthRequest, res));

  return router;
}
