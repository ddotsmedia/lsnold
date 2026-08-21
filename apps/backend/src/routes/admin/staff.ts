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
import { logActivity } from '../../utils/activityLog.js';

/**
 * The team shown on the About / Nursery page.
 *
 * Same shape and reasoning as routes/admin/faqs.ts: public read for the page,
 * pages permissions for the writes, soft deletes.
 *
 * photo_url is scheme-checked rather than passed to z.url(), which accepts
 * javascript: and data: — the value is rendered into an <img src> on a public
 * page.
 */

const staffSchema = z.object({
  name: z.string().trim().min(1, 'A name is required').max(200),
  role: z.string().trim().max(100).nullable().transform((v) => (v ? v : null)),
  bio: z.string().trim().max(2000).nullable().transform((v) => (v ? v : null)),
  photo_url: z.string().trim().max(500)
    .refine(
      (v) => v === '' || /^https?:\/\//i.test(v),
      'Use a full http:// or https:// URL, or leave it empty'
    )
    .nullable().transform((v) => (v ? v : null)),
  display_order: z.number().int().min(0).max(9999),
  published: z.boolean(),
});

const createSchema = staffSchema.partial({
  role: true, bio: true, photo_url: true, display_order: true, published: true,
});
const updateSchema = staffSchema.partial();
const reorderSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) });

const STAFF_FIELDS = ['name', 'role', 'bio', 'photo_url', 'display_order', 'published'] as const;

const COLUMNS =
  'id, name, role, bio, photo_url, display_order, published, created_at, updated_at';

/** Public read: published rows only, in display order. */
export async function listPublicStaff(db: Pool, _req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await db.query(
      `SELECT ${COLUMNS} FROM staff
        WHERE deleted_at IS NULL AND published = TRUE
        ORDER BY display_order, created_at`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Failed to fetch staff:', error);
    // Never break the About page over its team block.
    res.json([]);
  }
}

async function listStaff(db: Pool, _req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await db.query(
      `SELECT ${COLUMNS} FROM staff
        WHERE deleted_at IS NULL
        ORDER BY display_order, created_at`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Failed to fetch staff:', error);
    res.status(500).json({ error: 'Failed to fetch staff' });
  }
}

async function createStaff(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid staff member' });
    return;
  }

  try {
    const d = parsed.data;
    const next = await db.query(
      'SELECT COALESCE(MAX(display_order), 0) + 1 AS n FROM staff WHERE deleted_at IS NULL'
    );
    const order = d.display_order ?? (next.rows[0]?.n as number ?? 1);

    const result = await db.query(
      `INSERT INTO staff (name, role, bio, photo_url, display_order, published, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${COLUMNS}`,
      [d.name, d.role ?? null, d.bio ?? null, d.photo_url ?? null, order,
       d.published ?? true, req.userId ?? null]
    );

    const row = result.rows[0] as { id: string };
    await logActivity(db, req.userId, 'create', 'staff', row.id, { newValues: d, req });
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Failed to create staff member:', error);
    res.status(500).json({ error: 'Failed to create staff member' });
  }
}

async function updateStaff(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid staff member' });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const supplied = STAFF_FIELDS.filter((f) => Object.prototype.hasOwnProperty.call(body, f));
  if (supplied.length === 0) {
    res.status(400).json({ error: 'No fields supplied' });
    return;
  }

  try {
    const values = supplied.map((f) => parsed.data[f] ?? null);
    const assignments = supplied.map((f, i) => `${f} = $${i + 1}`).join(', ');

    const result = await db.query(
      `UPDATE staff
          SET ${assignments}, updated_at = CURRENT_TIMESTAMP, updated_by = $${supplied.length + 1}
        WHERE id = $${supplied.length + 2} AND deleted_at IS NULL
        RETURNING ${COLUMNS}`,
      [...values, req.userId ?? null, req.params.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Staff member not found' });
      return;
    }

    await logActivity(db, req.userId, 'update', 'staff', req.params.id, {
      newValues: parsed.data as Record<string, unknown>, req,
    });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Failed to update staff member:', error);
    res.status(500).json({ error: 'Failed to update staff member' });
  }
}

async function reorderStaff(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  const parsed = reorderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid order' });
    return;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    for (const [index, id] of parsed.data.ids.entries()) {
      await client.query(
        'UPDATE staff SET display_order = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND deleted_at IS NULL',
        [index + 1, id]
      );
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to reorder staff:', error);
    res.status(500).json({ error: 'Failed to reorder staff' });
  } finally {
    client.release();
  }
}

async function deleteStaff(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await db.query(
      `UPDATE staff SET deleted_at = CURRENT_TIMESTAMP, updated_by = $1
        WHERE id = $2 AND deleted_at IS NULL RETURNING id`,
      [req.userId ?? null, req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Staff member not found' });
      return;
    }
    await logActivity(db, req.userId, 'delete', 'staff', req.params.id, { req });
    res.status(204).send();
  } catch (error) {
    console.error('Failed to delete staff member:', error);
    res.status(500).json({ error: 'Failed to delete staff member' });
  }
}

export function createAdminStaffRouter(db: Pool): express.Router {
  const router = express.Router();
  const resolveAdmin = createResolveAdmin(db);

  router.use(authenticate, resolveAdmin, createResolvePermissions(db), requirePanelAccess);

  router.get('/', requirePermission('view:pages'), (req, res) =>
    listStaff(db, req as AuthRequest, res));
  router.post('/', requirePermission('create:pages'), (req, res) =>
    createStaff(db, req as AuthRequest, res));
  router.put('/reorder', requirePermission('edit:pages'), (req, res) =>
    reorderStaff(db, req as AuthRequest, res));
  router.put('/:id', requirePermission('edit:pages'), (req, res) =>
    updateStaff(db, req as AuthRequest, res));
  router.delete('/:id', requirePermission('delete:pages'), (req, res) =>
    deleteStaff(db, req as AuthRequest, res));

  return router;
}

export default createAdminStaffRouter;
