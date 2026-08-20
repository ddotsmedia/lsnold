import express from 'express';
import type { Response } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { authenticate, createResolveAdmin } from '../../middleware/auth.js';
import type { AuthRequest } from '../../middleware/auth.js';
import {
  createResolvePermissions,
  requirePermission,
  requirePanelAccess,
} from '../../middleware/permissions.js';

/**
 * The site's name, tagline and accent colour.
 *
 * The logo is not here. It lives in site_media under media_key = 'logo' and is
 * uploaded through the Media Library; see migration 043 for why it was not
 * copied into this table.
 *
 * Reading is public — the header on every visitor-facing page needs the name,
 * and none of these three fields is a secret. Writing needs manage:settings,
 * the permission the other settings writes already use. The brief asked for
 * edit:admin, which is not a permission this system has: it would have been
 * held by nobody, so the save button would have returned 403 to every account
 * including the owner's.
 */

const brandingSchema = z.object({
  site_name: z.string().trim().min(1, 'A site name is required').max(200),
  // Empty string from an untouched input means "no tagline", not "".
  tagline: z.string().trim().max(300).nullable().optional()
    .transform((v) => (v ? v : null)),
  // Checked here as well as by the column constraint. This value is
  // interpolated into a style attribute on the public site, so it is the one
  // field on this table that reaches the page as code rather than as text —
  // anything that is not six hex digits is refused before it gets near a page.
  primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a colour like #1e40af'),
});

/** Falls back to the seeded row's values if the table is somehow empty. */
const FALLBACK = {
  id: 1,
  site_name: 'Little Smarties',
  tagline: null,
  primary_color: '#1e40af',
};

export async function getBranding(db: Pool, _req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await db.query(
      'SELECT id, site_name, tagline, primary_color, updated_at FROM site_branding WHERE id = 1'
    );
    // Never 404 or 500 into the public header: a missing row must leave the
    // site reading exactly as it did before, not blank out its own name.
    res.json(result.rows[0] ?? FALLBACK);
  } catch (error) {
    console.error('Failed to fetch branding:', error);
    res.json(FALLBACK);
  }
}

async function updateBranding(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  const parsed = brandingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid branding' });
    return;
  }

  const { site_name, tagline, primary_color } = parsed.data;

  try {
    // Keyed on id = 1 rather than a subquery, since the table is constrained to
    // that single row. Upserts rather than updates so a database that somehow
    // lost its seed row repairs itself on the next save.
    const result = await db.query(
      `INSERT INTO site_branding (id, site_name, tagline, primary_color, updated_at, updated_by)
            VALUES (1, $1, $2, $3, CURRENT_TIMESTAMP, $4)
       ON CONFLICT (id) DO UPDATE
               SET site_name = $1,
                   tagline = $2,
                   primary_color = $3,
                   updated_at = CURRENT_TIMESTAMP,
                   updated_by = $4
         RETURNING id, site_name, tagline, primary_color, updated_at`,
      [site_name, tagline ?? null, primary_color, req.userId ?? null]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Failed to update branding:', error);
    res.status(500).json({ error: 'Failed to update branding' });
  }
}

export function createBrandingRouter(db: Pool): express.Router {
  const router = express.Router();
  const resolveAdmin = createResolveAdmin(db);

  // The same chain every other admin sub-router applies. The public read is
  // registered separately in routes/content.ts and calls getBranding directly,
  // so it is unaffected by this guard.
  router.use(authenticate, resolveAdmin, createResolvePermissions(db), requirePanelAccess);

  router.get('/', requirePermission('view:settings'), (req, res) =>
    getBranding(db, req as AuthRequest, res));
  router.put('/', requirePermission('manage:settings'), (req, res) =>
    updateBranding(db, req as AuthRequest, res));
  return router;
}
