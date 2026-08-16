import express from 'express';
import type { Pool } from 'pg';
import multer from 'multer';
import { authenticate, createResolveAdmin, requireAdmin } from '../../middleware/auth.js';
import { createResolvePermissions, requirePermission, requirePanelAccess } from '../../middleware/permissions.js';
import type { AuthRequest } from '../../middleware/auth.js';
import * as c from '../../controllers/mediaController.js';

// memoryStorage: the buffer goes straight to Cloudinary, so nothing is written
// to the container's disk. 10 MB matches the gallery uploader.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype?.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

/** Turns multer's own errors into JSON rather than an HTML stack trace. */
const handleUpload: express.RequestHandler = (req, res, next) => {
  upload.single('file')(req, res, (err: unknown) => {
    if (!err) { next(); return; }
    const message = err instanceof Error ? err.message : 'Upload failed';
    const tooBig = message.includes('File too large');
    res.status(400).json({ error: tooBig ? 'Image must be 10 MB or smaller' : message });
  });
};

export function createAdminMediaRouter(db: Pool): express.Router {
  const router = express.Router();
  const resolveAdmin = createResolveAdmin(db);

  router.use(authenticate, resolveAdmin, createResolvePermissions(db), requirePanelAccess);

  // Library
  router.get('/', requirePermission('view:media'), (req, res) => c.listMedia(db, req as AuthRequest, res));
  router.post('/upload', requirePermission('edit:media'), handleUpload, (req, res) => c.uploadMedia(db, req as AuthRequest, res));
  router.put('/:id', requirePermission('edit:media'), (req, res) => c.updateMedia(db, req as AuthRequest, res));
  router.delete('/:id', requirePermission('delete:media'), (req, res) => c.deleteMedia(db, req as AuthRequest, res));
  router.post('/bulk-delete', requirePermission('edit:media'), (req, res) => c.bulkDeleteMedia(db, req as AuthRequest, res));

  // Assignments. Nested here so everything media-related shares one guard.
  router.get('/age-groups/:slug', requirePermission('view:media'), (req, res) => c.getAgeGroupMedia(db, req as AuthRequest, res));
  router.post('/age-groups/:slug', requirePermission('edit:media'), (req, res) => c.assignAgeGroupMedia(db, req as AuthRequest, res));
  router.post('/age-groups/:slug/reorder', requirePermission('edit:media'), (req, res) => c.reorderAgeGroupMedia(db, req as AuthRequest, res));

  router.get('/pages/:slug', requirePermission('view:media'), (req, res) => c.getPageMedia(db, req as AuthRequest, res));
  router.post('/pages/:slug', requirePermission('edit:media'), (req, res) => c.assignPageMedia(db, req as AuthRequest, res));

  router.get('/site', requirePermission('view:media'), (req, res) => c.getSiteMedia(db, req as AuthRequest, res));
  router.post('/site', requirePermission('edit:media'), (req, res) => c.assignSiteMedia(db, req as AuthRequest, res));

  router.delete('/assignments/:kind/:id', requirePermission('delete:media'), (req, res) => c.unassign(db, req as AuthRequest, res));

  return router;
}
