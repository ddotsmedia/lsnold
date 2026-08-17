import express from 'express';
import type { Response } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { authenticate, createResolveAdmin } from '../../middleware/auth.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { createResolvePermissions, requirePanelAccess } from '../../middleware/permissions.js';

/**
 * Saved filters for the admin tables.
 *
 * Scoped to the caller throughout — every statement carries `user_id = req.userId`,
 * so one admin can neither read nor delete another's. No permission check beyond
 * panel access, for the same reason as the dashboard layout: these are the
 * caller's own shortcuts.
 */

const PresetSchema = z.object({
  screen: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1, 'Give the preset a name').max(80),
  // Values only; a filter is a flat set of query parameters.
  filters: z.record(z.string(), z.string()).refine(
    (value) => Object.keys(value).length <= 20,
    'Too many filters'
  ),
});

async function listPresets(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const screen = typeof req.query.screen === 'string' ? req.query.screen : null;
    const result = await db.query(
      `SELECT id, screen, name, filters FROM filter_presets
        WHERE user_id = $1 AND ($2::text IS NULL OR screen = $2)
        ORDER BY name`,
      [req.userId, screen]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('listPresets failed', error);
    // A saved filter is a convenience; the table still works without it.
    res.json([]);
  }
}

async function savePreset(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const data = PresetSchema.parse(req.body);
    // Saving under an existing name replaces it, which is what "save" means
    // when the name is already in the list.
    const result = await db.query(
      `INSERT INTO filter_presets (user_id, screen, name, filters)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (user_id, screen, lower(name))
       DO UPDATE SET filters = EXCLUDED.filters
       RETURNING id, screen, name, filters`,
      [req.userId, data.screen, data.name, JSON.stringify(data.filters)]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
      return;
    }
    console.error('savePreset failed', error);
    res.status(500).json({ error: 'Failed to save preset' });
  }
}

async function deletePreset(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await db.query(
      'DELETE FROM filter_presets WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.userId]
    );
    // Scoped to the caller, so another admin's preset reads as absent rather
    // than forbidden — it is none of their business that it exists.
    if (result.rows.length === 0) { res.status(404).json({ error: 'Preset not found' }); return; }
    res.status(204).send();
  } catch (error) {
    if ((error as { code?: string }).code === '22P02') {
      res.status(404).json({ error: 'Preset not found' });
      return;
    }
    console.error('deletePreset failed', error);
    res.status(500).json({ error: 'Failed to delete preset' });
  }
}

export function createAdminFilterPresetsRouter(db: Pool): express.Router {
  const router = express.Router();
  const resolveAdmin = createResolveAdmin(db);

  router.use(authenticate, resolveAdmin, createResolvePermissions(db), requirePanelAccess);

  router.get('/', (req, res) => listPresets(db, req as AuthRequest, res));
  router.post('/', (req, res) => savePreset(db, req as AuthRequest, res));
  router.delete('/:id', (req, res) => deletePreset(db, req as AuthRequest, res));

  return router;
}
