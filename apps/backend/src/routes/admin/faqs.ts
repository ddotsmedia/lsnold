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
 * The contact page's FAQs.
 *
 * Reading is public — the contact page renders for signed-out visitors.
 * Writing reuses the pages permissions rather than a new view:faqs /
 * edit:faqs pair: a permission that exists in no role is held by nobody, so
 * every save would 403 including the owner's. These answers are page content
 * and are managed like page content.
 *
 * Deletes are soft, matching the rest of the panel, so a question removed by
 * mistake is still in the table.
 */

const faqSchema = z.object({
  question: z.string().trim().min(1, 'A question is required').max(500),
  answer: z.string().trim().min(1, 'An answer is required').max(5000),
  category: z.string().trim().max(50).nullable().transform((v) => (v ? v : null)),
  display_order: z.number().int().min(0).max(9999),
  published: z.boolean(),
});

const createSchema = faqSchema.partial({ category: true, display_order: true, published: true });
const updateSchema = faqSchema.partial();
const reorderSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) });

const FAQ_FIELDS = ['question', 'answer', 'category', 'display_order', 'published'] as const;

const COLUMNS =
  'id, question, answer, category, display_order, published, created_at, updated_at';

/** Public read: published rows only, in display order. */
export async function listPublicFaqs(db: Pool, _req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await db.query(
      `SELECT ${COLUMNS} FROM faqs
        WHERE deleted_at IS NULL AND published = TRUE
        ORDER BY display_order, created_at`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Failed to fetch FAQs:', error);
    // Never break the contact page over its FAQ block.
    res.json([]);
  }
}

async function listFaqs(db: Pool, _req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await db.query(
      `SELECT ${COLUMNS} FROM faqs
        WHERE deleted_at IS NULL
        ORDER BY display_order, created_at`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Failed to fetch FAQs:', error);
    res.status(500).json({ error: 'Failed to fetch FAQs' });
  }
}

async function createFaq(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid FAQ' });
    return;
  }

  try {
    const d = parsed.data;
    // A new question goes to the end unless a position was given.
    const next = await db.query(
      'SELECT COALESCE(MAX(display_order), 0) + 1 AS n FROM faqs WHERE deleted_at IS NULL'
    );
    const order = d.display_order ?? (next.rows[0]?.n as number ?? 1);

    const result = await db.query(
      `INSERT INTO faqs (question, answer, category, display_order, published, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${COLUMNS}`,
      [d.question, d.answer, d.category ?? null, order, d.published ?? true, req.userId ?? null]
    );

    const row = result.rows[0] as { id: string };
    await logActivity(db, req.userId, 'create', 'faqs', row.id, { newValues: d, req });
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Failed to create FAQ:', error);
    res.status(500).json({ error: 'Failed to create FAQ' });
  }
}

async function updateFaq(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid FAQ' });
    return;
  }

  // Presence read off the raw body so an omitted field stays untouched — for
  // category that is a different outcome from being sent as null.
  const body = (req.body ?? {}) as Record<string, unknown>;
  const supplied = FAQ_FIELDS.filter((f) => Object.prototype.hasOwnProperty.call(body, f));
  if (supplied.length === 0) {
    res.status(400).json({ error: 'No fields supplied' });
    return;
  }

  try {
    const values = supplied.map((f) => parsed.data[f] ?? null);
    const assignments = supplied.map((f, i) => `${f} = $${i + 1}`).join(', ');

    const result = await db.query(
      `UPDATE faqs
          SET ${assignments}, updated_at = CURRENT_TIMESTAMP, updated_by = $${supplied.length + 1}
        WHERE id = $${supplied.length + 2} AND deleted_at IS NULL
        RETURNING ${COLUMNS}`,
      [...values, req.userId ?? null, req.params.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'FAQ not found' });
      return;
    }

    await logActivity(db, req.userId, 'update', 'faqs', req.params.id, {
      newValues: parsed.data as Record<string, unknown>, req,
    });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Failed to update FAQ:', error);
    res.status(500).json({ error: 'Failed to update FAQ' });
  }
}

/** One request for a whole drag, rather than a PUT per row that moved. */
async function reorderFaqs(db: Pool, req: AuthRequest, res: Response): Promise<void> {
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
        'UPDATE faqs SET display_order = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND deleted_at IS NULL',
        [index + 1, id]
      );
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to reorder FAQs:', error);
    res.status(500).json({ error: 'Failed to reorder FAQs' });
  } finally {
    client.release();
  }
}

async function deleteFaq(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await db.query(
      `UPDATE faqs SET deleted_at = CURRENT_TIMESTAMP, updated_by = $1
        WHERE id = $2 AND deleted_at IS NULL RETURNING id`,
      [req.userId ?? null, req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'FAQ not found' });
      return;
    }
    await logActivity(db, req.userId, 'delete', 'faqs', req.params.id, { req });
    res.status(204).send();
  } catch (error) {
    console.error('Failed to delete FAQ:', error);
    res.status(500).json({ error: 'Failed to delete FAQ' });
  }
}

export function createAdminFaqsRouter(db: Pool): express.Router {
  const router = express.Router();
  const resolveAdmin = createResolveAdmin(db);

  router.use(authenticate, resolveAdmin, createResolvePermissions(db), requirePanelAccess);

  router.get('/', requirePermission('view:pages'), (req, res) =>
    listFaqs(db, req as AuthRequest, res));
  router.post('/', requirePermission('create:pages'), (req, res) =>
    createFaq(db, req as AuthRequest, res));
  router.put('/reorder', requirePermission('edit:pages'), (req, res) =>
    reorderFaqs(db, req as AuthRequest, res));
  router.put('/:id', requirePermission('edit:pages'), (req, res) =>
    updateFaq(db, req as AuthRequest, res));
  router.delete('/:id', requirePermission('delete:pages'), (req, res) =>
    deleteFaq(db, req as AuthRequest, res));

  return router;
}

export default createAdminFaqsRouter;
