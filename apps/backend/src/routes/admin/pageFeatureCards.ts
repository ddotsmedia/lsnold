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
 * Feature cards for a page, grouped by section key. See migration 062.
 *
 * Same shape and reasoning as routes/admin/staff.ts: pages permissions for the
 * writes, soft deletes, one row per card rather than a JSON blob so a card can
 * be reordered, deleted and restored individually.
 *
 * The brief asked for publish:pages on the write. These use the create / edit /
 * delete:pages triple the rest of the page content uses instead — publish:pages
 * gates going live, and an editor who can rewrite every section on the page
 * would otherwise be refused on its cards.
 */

/** The card colours the frontend styles. Anything else would render untinted. */
const COLORS = ['blue', 'green', 'red', 'yellow', 'purple'] as const;

const cardSchema = z.object({
  section_key: z.string().trim().min(1, 'A section key is required').max(100),
  title: z.string().trim().min(1, 'A title is required').max(255),
  description: z.string().trim().max(2000).nullable().transform((v) => (v ? v : null)),
  // Emoji, and short. A long string here would break the card layout.
  icon: z.string().trim().max(50).nullable().transform((v) => (v ? v : null)),
  color: z.enum(COLORS),
  sort_order: z.number().int().min(0).max(9999),
});

const createSchema = cardSchema.partial({ description: true, icon: true, color: true, sort_order: true });
const updateSchema = cardSchema.partial();
const reorderSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) });

const CARD_FIELDS = ['section_key', 'title', 'description', 'icon', 'color', 'sort_order'] as const;

const COLUMNS =
  'id, page_slug, section_key, title, description, icon, color, sort_order, created_at, updated_at';

/**
 * Public read: every card for a page, in order.
 *
 * Fails to an empty array rather than an error, so a database problem leaves
 * the page showing its built-in copy instead of breaking the section.
 */
export async function listPublicFeatureCards(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await db.query(
      `SELECT ${COLUMNS} FROM page_feature_cards
        WHERE deleted_at IS NULL AND page_slug = $1
        ORDER BY section_key, sort_order, created_at`,
      [req.params.slug]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Failed to fetch feature cards:', error);
    res.json([]);
  }
}

async function listCards(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await db.query(
      `SELECT ${COLUMNS} FROM page_feature_cards
        WHERE deleted_at IS NULL AND page_slug = $1
        ORDER BY section_key, sort_order, created_at`,
      [req.params.pageSlug]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Failed to fetch feature cards:', error);
    res.status(500).json({ error: 'Failed to fetch feature cards' });
  }
}

async function createCard(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid feature card' });
    return;
  }

  try {
    const d = parsed.data;
    const pageSlug = req.params.pageSlug as string;

    // Append to the end of its own group, not the page.
    const next = await db.query(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM page_feature_cards
        WHERE deleted_at IS NULL AND page_slug = $1 AND section_key = $2`,
      [pageSlug, d.section_key]
    );
    const order = d.sort_order ?? ((next.rows[0]?.n as number) ?? 0);

    const result = await db.query(
      `INSERT INTO page_feature_cards
         (page_slug, section_key, title, description, icon, color, sort_order, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${COLUMNS}`,
      [pageSlug, d.section_key, d.title, d.description ?? null, d.icon ?? null,
       d.color ?? 'blue', order, req.userId ?? null]
    );

    const row = result.rows[0] as { id: string };
    await logActivity(db, req.userId, 'create', 'page_feature_card', row.id, { newValues: d, req });
    res.status(201).json(result.rows[0]);
  } catch (error) {
    // The unique index on (page_slug, section_key, lower(title)).
    if ((error as { code?: string }).code === '23505') {
      res.status(400).json({ error: 'A card with that title already exists in this section' });
      return;
    }
    console.error('Failed to create feature card:', error);
    res.status(500).json({ error: 'Failed to create feature card' });
  }
}

async function updateCard(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid feature card' });
    return;
  }

  // Read presence from the raw body: a partial schema cannot distinguish
  // "clear this field" from "leave it alone" once it has parsed.
  const body = (req.body ?? {}) as Record<string, unknown>;
  const supplied = CARD_FIELDS.filter((f) => Object.prototype.hasOwnProperty.call(body, f));
  if (supplied.length === 0) {
    res.status(400).json({ error: 'No fields supplied' });
    return;
  }

  try {
    const values = supplied.map((f) => parsed.data[f] ?? null);
    const assignments = supplied.map((f, i) => `${f} = $${i + 1}`).join(', ');

    const result = await db.query(
      `UPDATE page_feature_cards
          SET ${assignments}, updated_at = CURRENT_TIMESTAMP, updated_by = $${supplied.length + 1}
        WHERE id = $${supplied.length + 2} AND deleted_at IS NULL
        RETURNING ${COLUMNS}`,
      [...values, req.userId ?? null, req.params.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Feature card not found' });
      return;
    }

    await logActivity(db, req.userId, 'update', 'page_feature_card', req.params.id, {
      newValues: parsed.data as Record<string, unknown>, req,
    });
    res.json(result.rows[0]);
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      res.status(400).json({ error: 'A card with that title already exists in this section' });
      return;
    }
    console.error('Failed to update feature card:', error);
    res.status(500).json({ error: 'Failed to update feature card' });
  }
}

async function reorderCards(db: Pool, req: AuthRequest, res: Response): Promise<void> {
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
        `UPDATE page_feature_cards SET sort_order = $1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2 AND deleted_at IS NULL AND page_slug = $3`,
        [index, id, req.params.pageSlug]
      );
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to reorder feature cards:', error);
    res.status(500).json({ error: 'Failed to reorder feature cards' });
  } finally {
    client.release();
  }
}

async function deleteCard(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await db.query(
      `UPDATE page_feature_cards SET deleted_at = CURRENT_TIMESTAMP, updated_by = $1
        WHERE id = $2 AND deleted_at IS NULL RETURNING id`,
      [req.userId ?? null, req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Feature card not found' });
      return;
    }
    await logActivity(db, req.userId, 'delete', 'page_feature_card', req.params.id, { req });
    res.status(204).send();
  } catch (error) {
    console.error('Failed to delete feature card:', error);
    res.status(500).json({ error: 'Failed to delete feature card' });
  }
}

export function createAdminPageFeatureCardsRouter(db: Pool): express.Router {
  const router = express.Router();
  const resolveAdmin = createResolveAdmin(db);

  router.use(authenticate, resolveAdmin, createResolvePermissions(db), requirePanelAccess);

  // /reorder before /:id so the literal is not swallowed by the parameter.
  router.post('/:pageSlug/reorder', requirePermission('edit:pages'), (req, res) =>
    reorderCards(db, req as AuthRequest, res));
  router.get('/:pageSlug', requirePermission('view:pages'), (req, res) =>
    listCards(db, req as AuthRequest, res));
  router.post('/:pageSlug', requirePermission('create:pages'), (req, res) =>
    createCard(db, req as AuthRequest, res));
  router.put('/card/:id', requirePermission('edit:pages'), (req, res) =>
    updateCard(db, req as AuthRequest, res));
  router.delete('/card/:id', requirePermission('delete:pages'), (req, res) =>
    deleteCard(db, req as AuthRequest, res));

  return router;
}

export default createAdminPageFeatureCardsRouter;
