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
 * The footer's company name, logo and contact details.
 *
 * Reading is public — the footer renders on every visitor-facing page and a
 * visitor holds no token, so this has to be readable unauthenticated. Writing
 * needs manage:settings, matching the branding editor.
 *
 * email, address and hours are newline-separated lists; see migration 045.
 * They are stored exactly as typed and split for rendering, so nothing here
 * reaches the page as anything but text.
 */

const footerSchema = z.object({
  company_name: z.string().trim().min(1, 'A company name is required').max(200),
  // This value lands in an <img src> on every public page, so the scheme is
  // checked as well as the shape. z.url() alone is not enough — it accepts
  // javascript: and data: URLs, which is exactly what must not get through.
  logo_url: z.string().trim().max(2048)
    .refine(
      (v) => v === '' || /^https?:\/\//i.test(v),
      'Use a full http:// or https:// URL, or leave it empty'
    )
    .nullable().transform((v) => (v ? v : null)),
  phone: z.string().trim().max(50).nullable().transform((v) => (v ? v : null)),
  email: z.string().trim().max(500).nullable().transform((v) => (v ? v : null)),
  address: z.string().trim().max(1000).nullable().transform((v) => (v ? v : null)),
  hours: z.string().trim().max(500).nullable().transform((v) => (v ? v : null)),
}).partial();

/** Column order below, so a field's name and its $n stay in one place. */
const FOOTER_FIELDS = [
  'company_name', 'logo_url', 'phone', 'email', 'address', 'hours',
] as const;

/** Falls back to the seeded row's values if the table is somehow empty. */
const FALLBACK = {
  id: 1,
  company_name: 'Little Smarties',
  logo_url: null,
  phone: '+971 56 267 7747',
  email: 'lsnmoj@gmail.com\ninfo@lsn.ae',
  address:
    'Ministry Of Justice Ground Floor, Khalifa City (A)\n' +
    'Sector 133, Street 12, P.O. Box 260\n' +
    'Abu Dhabi United Arab Emirates',
  hours: 'Mon – Fri: 7:00 – 18:00\nWeekends: Closed',
};

export async function getFooter(db: Pool, _req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await db.query(
      `SELECT id, company_name, logo_url, phone, email, address, hours, updated_at
         FROM site_footer WHERE id = 1`
    );
    // Never 404 or 500 into the public footer: a missing row must leave the
    // site reading exactly as it did before, not blank out its own address.
    res.json(result.rows[0] ?? FALLBACK);
  } catch (error) {
    console.error('Failed to fetch footer:', error);
    res.json(FALLBACK);
  }
}

async function updateFooter(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  const parsed = footerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid footer' });
    return;
  }

  // Presence is read off the raw body, not the parsed result: a field the
  // caller omitted must stay untouched, and for the nullable fields that is a
  // different outcome from being sent as null.
  const body = (req.body ?? {}) as Record<string, unknown>;
  const supplied = FOOTER_FIELDS.filter((f) =>
    Object.prototype.hasOwnProperty.call(body, f)
  );

  if (supplied.length === 0) {
    res.status(400).json({ error: 'No footer fields supplied' });
    return;
  }

  // $1..$6 always carry all six columns so the INSERT branch has a complete
  // row; unsupplied ones fall back to the seed defaults. The UPDATE branch then
  // assigns only what was actually sent.
  const values = FOOTER_FIELDS.map((f) =>
    supplied.includes(f) ? parsed.data[f] ?? null : FALLBACK[f]
  );
  const assignments = supplied
    .map((f) => `${f} = $${FOOTER_FIELDS.indexOf(f) + 1}`)
    .join(',\n                   ');

  try {
    // Upserts rather than updates so a database that somehow lost its seed row
    // repairs itself on the next save.
    const result = await db.query(
      `INSERT INTO site_footer
              (id, company_name, logo_url, phone, email, address, hours,
               updated_at, updated_by)
            VALUES (1, $1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, $7)
       ON CONFLICT (id) DO UPDATE
               SET ${assignments},
                   updated_at = CURRENT_TIMESTAMP,
                   updated_by = $7
         RETURNING id, company_name, logo_url, phone, email, address, hours,
                   updated_at`,
      [...values, req.userId ?? null]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Failed to update footer:', error);
    res.status(500).json({ error: 'Failed to update footer' });
  }
}

export function createFooterRouter(db: Pool): express.Router {
  const router = express.Router();
  const resolveAdmin = createResolveAdmin(db);

  // The same chain the branding editor applies. The public read is registered
  // separately in routes/content.ts and calls getFooter directly, so it is
  // unaffected by this guard.
  router.use(authenticate, resolveAdmin, createResolvePermissions(db), requirePanelAccess);

  router.get('/', requirePermission('view:settings'), (req, res) =>
    getFooter(db, req as AuthRequest, res));
  router.put('/', requirePermission('manage:settings'), (req, res) =>
    updateFooter(db, req as AuthRequest, res));
  return router;
}

export default createFooterRouter;
