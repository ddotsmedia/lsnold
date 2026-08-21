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

/**
 * Every field is optional, and only the ones actually sent are written.
 *
 * Two admin pages edit this single row and each owns a different half of it:
 * Branding sets site_name/tagline/primary_color, Typography sets
 * font_family/base_font_size. Requiring all five meant Branding's three-field
 * save was rejected as "Required". Making each page echo back the other's
 * fields would have fixed the error but introduced a worse one — whichever page
 * saved last would overwrite the other's settings with whatever it had loaded.
 */
const brandingSchema = z.object({
  site_name: z.string().trim().min(1, 'A site name is required').max(200),
  // Empty string from an untouched input means "no tagline", not "".
  // Nullable but not optional here: `.partial()` below adds the optionality, so
  // an absent key skips the transform instead of being coerced to null — that
  // is what keeps "clear the tagline" distinct from "leave the tagline alone".
  tagline: z.string().trim().max(300).nullable()
    .transform((v) => (v ? v : null)),
  // Checked here as well as by the column constraint. This value is
  // interpolated into a style attribute on the public site, so it is the one
  // field on this table that reaches the page as code rather than as text —
  // anything that is not six hex digits is refused before it gets near a page.
  primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a colour like #1e40af'),
  // A token, not a font stack — the same eight the CHECK constraint allows and
  // the picker offers. Mapped to real CSS in the frontend's lib/typography.ts,
  // so nothing typed into a form ever becomes styling.
  font_family: z.enum([
    'default', 'system', 'georgia', 'times', 'arial', 'verdana', 'trebuchet', 'comic',
  ]),
  // Sets the root font size, and the site's sizes are all in rem, so this
  // scales every page. Bounded to what the layout still holds together at.
  base_font_size: z.number().int().min(12).max(24),
}).partial();

/** Column order below, so a field's name and its $n stay in one place. */
const BRANDING_FIELDS = [
  'site_name', 'tagline', 'primary_color', 'font_family', 'base_font_size',
] as const;

/** Falls back to the seeded row's values if the table is somehow empty. */
const FALLBACK = {
  id: 1,
  site_name: 'Little Smarties',
  tagline: null,
  primary_color: '#1e40af',
  font_family: 'default',
  base_font_size: 16,
};

export async function getBranding(db: Pool, _req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await db.query(
      `SELECT id, site_name, tagline, primary_color, font_family, base_font_size, updated_at
         FROM site_branding WHERE id = 1`
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

  // Presence is read off the raw body, not the parsed result: a field the
  // caller omitted must stay untouched, and for tagline that is a different
  // outcome from being sent as null.
  const body = (req.body ?? {}) as Record<string, unknown>;
  const supplied = BRANDING_FIELDS.filter((f) =>
    Object.prototype.hasOwnProperty.call(body, f)
  );

  if (supplied.length === 0) {
    res.status(400).json({ error: 'No branding fields supplied' });
    return;
  }

  // $1..$5 always carry all five columns so the INSERT branch has a complete
  // row; unsupplied ones fall back to the seed defaults. The UPDATE branch then
  // assigns only what was actually sent, leaving the other page's half alone.
  const values = BRANDING_FIELDS.map((f) =>
    supplied.includes(f) ? parsed.data[f] ?? null : FALLBACK[f]
  );
  const assignments = supplied
    .map((f) => `${f} = $${BRANDING_FIELDS.indexOf(f) + 1}`)
    .join(',\n                   ');

  try {
    // Keyed on id = 1 rather than a subquery, since the table is constrained to
    // that single row. Upserts rather than updates so a database that somehow
    // lost its seed row repairs itself on the next save.
    const result = await db.query(
      `INSERT INTO site_branding
              (id, site_name, tagline, primary_color, font_family, base_font_size,
               updated_at, updated_by)
            VALUES (1, $1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6)
       ON CONFLICT (id) DO UPDATE
               SET ${assignments},
                   updated_at = CURRENT_TIMESTAMP,
                   updated_by = $6
         RETURNING id, site_name, tagline, primary_color, font_family, base_font_size,
                   updated_at`,
      [...values, req.userId ?? null]
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
