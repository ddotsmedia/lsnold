import express from 'express';
import type { Pool } from 'pg';
import { authenticate, createResolveAdmin, requireAdmin } from '../../middleware/auth.js';
import { createResolvePermissions, requirePermission, requirePanelAccess } from '../../middleware/permissions.js';
import type { AuthRequest } from '../../middleware/auth.js';
import * as c from '../../controllers/socialLinksController.js';

export function createAdminSocialLinksRouter(db: Pool): express.Router {
  const router = express.Router();
  const resolveAdmin = createResolveAdmin(db);

  router.use(authenticate, resolveAdmin, createResolvePermissions(db), requirePanelAccess);

  router.get('/', requirePermission('view:settings'), (req, res) => c.listSocialLinks(db, req as AuthRequest, res));
  router.post('/', requirePermission('manage:settings'), (req, res) => c.createSocialLink(db, req as AuthRequest, res));
  router.put('/:id', requirePermission('manage:settings'), (req, res) => c.updateSocialLink(db, req as AuthRequest, res));
  router.delete('/:id', requirePermission('manage:settings'), (req, res) => c.deleteSocialLink(db, req as AuthRequest, res));
  router.post('/:id/restore', requirePermission('manage:settings'), (req, res) => c.restoreSocialLink(db, req as AuthRequest, res));

  return router;
}
