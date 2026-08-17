import express from 'express';
import type { Response } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { authenticate, createResolveAdmin } from '../../middleware/auth.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { createResolvePermissions, requirePanelAccess } from '../../middleware/permissions.js';

/**
 * A user's own dashboard arrangement and theme.
 *
 * Guarded by requirePanelAccess only, with no requirePermission: these are the
 * caller's own preferences, keyed to their own id, and a viewer has as much
 * right to arrange their screen as an administrator does. There is nothing here
 * one role should be able to do and another should not.
 */

const DEFAULTS = { widget_order: [], hidden_widgets: [], theme: 'dark' as const };

const PreferencesSchema = z.object({
  // Bounded so a malformed client cannot write an unbounded document.
  widget_order: z.array(z.string().max(60)).max(50),
  hidden_widgets: z.array(z.string().max(60)).max(50),
  theme: z.enum(['light', 'dark', 'system']),
});

async function getPreferences(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await db.query(
      'SELECT widget_order, hidden_widgets, theme FROM dashboard_preferences WHERE user_id = $1',
      [req.userId]
    );
    // No row is not an error; it means this user has never changed anything.
    res.json(result.rows[0] ?? DEFAULTS);
  } catch (error) {
    console.error('getPreferences failed', error);
    // The dashboard must still render if this fails, so answer with defaults
    // rather than a status the client has to handle.
    res.json(DEFAULTS);
  }
}

async function savePreferences(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const data = PreferencesSchema.parse(req.body);
    const result = await db.query(
      `INSERT INTO dashboard_preferences (user_id, widget_order, hidden_widgets, theme, updated_at)
       VALUES ($1, $2::jsonb, $3::jsonb, $4, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         widget_order = EXCLUDED.widget_order,
         hidden_widgets = EXCLUDED.hidden_widgets,
         theme = EXCLUDED.theme,
         updated_at = NOW()
       RETURNING widget_order, hidden_widgets, theme`,
      [req.userId, JSON.stringify(data.widget_order), JSON.stringify(data.hidden_widgets), data.theme]
    );
    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
      return;
    }
    console.error('savePreferences failed', error);
    res.status(500).json({ error: 'Failed to save preferences' });
  }
}

export function createAdminPreferencesRouter(db: Pool): express.Router {
  const router = express.Router();
  const resolveAdmin = createResolveAdmin(db);

  router.use(authenticate, resolveAdmin, createResolvePermissions(db), requirePanelAccess);

  router.get('/', (req, res) => getPreferences(db, req as AuthRequest, res));
  router.put('/', (req, res) => savePreferences(db, req as AuthRequest, res));

  return router;
}
