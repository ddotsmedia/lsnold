import express from 'express';
import type { Pool } from 'pg';
import multer from 'multer';
import { authenticate, createResolveAdmin, requireAdmin } from '../../middleware/auth.js';
import { createResolvePermissions, requirePermission, requirePanelAccess } from '../../middleware/permissions.js';
import type { AuthRequest } from '../../middleware/auth.js';
import * as c from '../../controllers/facilitiesController.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype?.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

const handleUpload: express.RequestHandler = (req, res, next) => {
  upload.single('file')(req, res, (err: unknown) => {
    if (!err) { next(); return; }
    const message = err instanceof Error ? err.message : 'Upload failed';
    const tooBig = message.includes('File too large');
    res.status(400).json({ error: tooBig ? 'Image must be 10 MB or smaller' : message });
  });
};

/** Registers every facility route on a router, for reuse at both mount points. */
export function registerFacilityRoutes(router: express.Router, db: Pool, prefix = ''): void {
  const p = prefix;
  // reorder before /:id, so it is not read as an id.
  router.post(`${p}/reorder`, requirePermission('edit:facilities'), (req, res) => c.reorderFacilities(db, req as AuthRequest, res));
  router.get(`${p}/`, requirePermission('view:facilities'), (req, res) => c.listFacilities(db, req as AuthRequest, res));
  router.get(`${p}/:id`, requirePermission('view:facilities'), (req, res) => c.getFacility(db, req as AuthRequest, res));
  router.post(`${p}/`, requirePermission('edit:facilities'), (req, res) => c.createFacility(db, req as AuthRequest, res));
  router.put(`${p}/:id`, requirePermission('edit:facilities'), (req, res) => c.updateFacility(db, req as AuthRequest, res));
  router.delete(`${p}/:id`, requirePermission('delete:facilities'), (req, res) => c.deleteFacility(db, req as AuthRequest, res));
  router.post(`${p}/:id/restore`, requirePermission('edit:facilities'), (req, res) => c.restoreFacility(db, req as AuthRequest, res));
  router.post(`${p}/:id/images`, requirePermission('edit:facilities'), handleUpload, (req, res) => c.uploadFacilityImage(db, req as AuthRequest, res));
  router.delete(`${p}/:id/images/:imageId`, requirePermission('delete:facilities'), (req, res) => c.deleteFacilityImage(db, req as AuthRequest, res));
}

export function createAdminFacilitiesRouter(db: Pool): express.Router {
  const router = express.Router();
  const resolveAdmin = createResolveAdmin(db);

  router.use(authenticate, resolveAdmin, createResolvePermissions(db), requirePanelAccess);
  registerFacilityRoutes(router, db);

  return router;
}
