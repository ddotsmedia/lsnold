import express from 'express';
import type { Pool } from 'pg';
import { authenticate, createResolveAdmin, requireAdmin } from '../../middleware/auth.js';
import { createResolvePermissions, requirePermission, requirePanelAccess } from '../../middleware/permissions.js';
import type { AuthRequest } from '../../middleware/auth.js';
import * as c from '../../controllers/youtubeVideosController.js';

export function createAdminYoutubeVideosRouter(db: Pool): express.Router {
  const router = express.Router();
  const resolveAdmin = createResolveAdmin(db);

  router.use(authenticate, resolveAdmin, createResolvePermissions(db), requirePanelAccess);

  router.get('/', requirePermission('view:videos'), (req, res) => c.listYoutubeVideos(db, req as AuthRequest, res));
  router.post('/', requirePermission('manage:videos'), (req, res) => c.createYoutubeVideo(db, req as AuthRequest, res));
  router.put('/:id', requirePermission('manage:videos'), (req, res) => c.updateYoutubeVideo(db, req as AuthRequest, res));
  router.delete('/:id', requirePermission('manage:videos'), (req, res) => c.deleteYoutubeVideo(db, req as AuthRequest, res));
  router.post('/:id/restore', requirePermission('manage:videos'), (req, res) => c.restoreYoutubeVideo(db, req as AuthRequest, res));

  return router;
}
