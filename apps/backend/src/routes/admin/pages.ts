import express from 'express';
import type { Response } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { authenticate, createResolveAdmin } from '../../middleware/auth.js';
import { createAdminPageImagesRouter } from './pageImages.js';
import * as content from '../../controllers/pageContentController.js';
import { rateLimit } from '../../middleware/rateLimit.js';
import { createResolvePermissions, requirePermission, requirePanelAccess } from '../../middleware/permissions.js';
import { sanitizeHtml } from '../../utils/sanitizeHtml.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { logActivity } from '../../utils/activityLog.js';

const PageSchema = z.object({
  title: z.string().min(1).max(255),
  slug: z.string().min(1).max(255),
  meta_title: z.string().max(255).optional().nullable(),
  meta_description: z.string().optional().nullable(),
  meta_keywords: z.string().optional().nullable(),
  og_image: z.string().url().optional().nullable(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
});

/** Same ceiling as a section body, so the preview cannot be used to submit more. */
const SanitizePreviewSchema = z.object({ html: z.string().max(50000) });

const ReorderSchema = z.object({
  ids: z.array(z.string().uuid()),
});

async function listPages(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const status = req.query.status as string | undefined;
    const search = req.query.search as string | undefined;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (status && ['draft', 'published', 'archived'].includes(status)) {
      conditions.push(`status = $${paramIdx++}`);
      params.push(status);
    }

    if (search) {
      conditions.push(`(LOWER(title) LIKE $${paramIdx} OR LOWER(slug) LIKE $${paramIdx})`);
      params.push(`%${search.toLowerCase()}%`);
      paramIdx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await db.query(`SELECT COUNT(*) FROM pages ${where}`, params);
    const total = Number(countResult.rows[0]?.count ?? 0);

    const dataResult = await db.query(
      `SELECT p.*, u.name as created_by_name
       FROM pages p
       LEFT JOIN users u ON p.created_by = u.id
       ${where}
       ORDER BY p.sort_order ASC, p.created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset]
    );

    res.json({ data: dataResult.rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('listPages failed', error);
    res.status(500).json({ error: 'Failed to fetch pages' });
  }
}

async function getPage(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await db.query(
      `SELECT p.*, u.name as created_by_name, u2.name as updated_by_name
       FROM pages p
       LEFT JOIN users u ON p.created_by = u.id
       LEFT JOIN users u2 ON p.updated_by = u2.id
       WHERE p.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Page not found' }); return; }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('getPage failed', error);
    res.status(500).json({ error: 'Failed to fetch page' });
  }
}

async function createPage(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const data = PageSchema.parse(req.body);
    const result = await db.query(
      `INSERT INTO pages (title, slug, meta_title, meta_description, meta_keywords, og_image, status, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8) RETURNING *`,
      [data.title, data.slug, data.meta_title || null,
       data.meta_description || null, data.meta_keywords || null,
       data.og_image || null, data.status || 'draft', req.userId]
    );
    await logActivity(db, req.userId, 'create', 'page', result.rows[0]?.id as string, { title: data.title, slug: data.slug });
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: error.issues }); return; }
    if (typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'A page with this slug already exists' });
      return;
    }
    console.error('createPage failed', error);
    res.status(500).json({ error: 'Failed to create page' });
  }
}

async function updatePage(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const data = PageSchema.partial().parse(req.body);
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    const fields = ['title', 'slug', 'meta_title', 'meta_description', 'meta_keywords', 'og_image', 'status'] as const;
    for (const f of fields) {
      if (data[f] !== undefined) { sets.push(`${f} = $${idx++}`); params.push(data[f] ?? null); }
    }
    sets.push(`updated_by = $${idx++}`);
    params.push(req.userId);
    sets.push(`updated_at = CURRENT_TIMESTAMP`);

    if (params.length <= 1) { res.status(400).json({ error: 'No fields to update' }); return; }

    params.push(id);
    const result = await db.query(
      `UPDATE pages SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Page not found' }); return; }
    await logActivity(db, req.userId, 'update', 'page', id, data as Record<string, unknown>);
    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: error.issues }); return; }
    if (typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'A page with this slug already exists' });
      return;
    }
    console.error('updatePage failed', error);
    res.status(500).json({ error: 'Failed to update page' });
  }
}

async function deletePage(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const result = await db.query('DELETE FROM pages WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Page not found' }); return; }
    await logActivity(db, req.userId, 'delete', 'page', id);
    res.status(204).send();
  } catch (error) {
    console.error('deletePage failed', error);
    res.status(500).json({ error: 'Failed to delete page' });
  }
}

async function reorderPages(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { ids } = ReorderSchema.parse(req.body);
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < ids.length; i++) {
        await client.query('UPDATE pages SET sort_order = $1 WHERE id = $2', [i, ids[i]]);
      }
      await client.query('COMMIT');
    } catch (err) { await client.query('ROLLBACK'); throw err; }
    finally { client.release(); }
    await logActivity(db, req.userId, 'update', 'page', null, { action: 'reorder', count: ids.length });
    res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: error.issues }); return; }
    console.error('reorderPages failed', error);
    res.status(500).json({ error: 'Failed to reorder pages' });
  }
}

async function publishPage(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const result = await db.query(
      `UPDATE pages SET status = 'published', updated_by = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
      [req.userId, id]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Page not found' }); return; }
    await logActivity(db, req.userId, 'status_change', 'page', id, { status: 'published' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('publishPage failed', error);
    res.status(500).json({ error: 'Failed to publish page' });
  }
}

async function unpublishPage(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const result = await db.query(
      `UPDATE pages SET status = 'draft', updated_by = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
      [req.userId, id]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Page not found' }); return; }
    await logActivity(db, req.userId, 'status_change', 'page', id, { status: 'draft' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('unpublishPage failed', error);
    res.status(500).json({ error: 'Failed to unpublish page' });
  }
}

export function createAdminPagesRouter(db: Pool): express.Router {
  const router = express.Router();
  const resolveAdmin = createResolveAdmin(db);

  const resolvePermissions = createResolvePermissions(db);
  router.use(authenticate, resolveAdmin, resolvePermissions, requirePanelAccess);

  // Nested before /:id so the images routes are matched first.
  router.use('/:id/images', createAdminPageImagesRouter(db));

  // Writes are rate limited; reads are not, so a busy editor never locks
  // itself out of simply viewing the page it is working on.
  const writeLimit = rateLimit({ max: 120, windowMs: 60_000, name: 'edits' });

  /**
   * Runs the section sanitiser without storing anything, so the editor's live
   * preview can show exactly what a save would keep rather than a near-enough
   * approximation. Registered before /:id so it is not read as a page id.
   *
   * Its own allowance: the editor calls this on every pause in typing, which
   * is a different rhythm from saving, and sharing the write budget would let
   * previewing lock an admin out of saving.
   */
  router.post(
    '/sanitize',
    rateLimit({ max: 600, windowMs: 60_000, name: 'previews' }),
    (req, res) => {
      const parsed = SanitizePreviewSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
        return;
      }
      res.json({ sanitized: sanitizeHtml(parsed.data.html) ?? '' });
    }
  );

  // Editable text sections. Before /:id so they are not read as an id.
  router.get('/:pageId/content', requirePermission('view:pages'), (req, res) => content.listSections(db, req as AuthRequest, res));
  router.post('/:pageId/content', requirePermission('create:pages'), writeLimit, (req, res) => content.createSection(db, req as AuthRequest, res));
  router.post('/:pageId/content/reorder', requirePermission('edit:pages'), writeLimit, (req, res) => content.reorderSections(db, req as AuthRequest, res));
  router.put('/:pageId/content/:sectionId', requirePermission('edit:pages'), writeLimit, (req, res) => content.updateSection(db, req as AuthRequest, res));
  router.delete('/:pageId/content/:sectionId', requirePermission('delete:pages'), writeLimit, (req, res) => content.deleteSection(db, req as AuthRequest, res));
  router.post('/:pageId/content/:sectionId/restore', requirePermission('edit:pages'), writeLimit, (req, res) => content.restoreSection(db, req as AuthRequest, res));

  // Publish state. Registered alongside the other content routes so they all
  // sit ahead of /:id.
  router.post('/:pageId/content/bulk', requirePermission('publish:pages'), writeLimit, (req, res) => content.bulkPublish(db, req as AuthRequest, res));
  router.post('/:pageId/content/:sectionId/publish', requirePermission('publish:pages'), writeLimit, (req, res) => content.publishSection(db, req as AuthRequest, res));
  router.post('/:pageId/content/:sectionId/unpublish', requirePermission('publish:pages'), writeLimit, (req, res) => content.unpublishSection(db, req as AuthRequest, res));
  router.post('/:pageId/content/:sectionId/schedule', requirePermission('publish:pages'), writeLimit, (req, res) => content.scheduleSection(db, req as AuthRequest, res));
  router.post('/:pageId/content/:sectionId/unschedule', requirePermission('publish:pages'), writeLimit, (req, res) => content.unscheduleSection(db, req as AuthRequest, res));

  router.get('/', requirePermission('view:pages'), (req, res) => listPages(db, req as AuthRequest, res));
  router.get('/:id', requirePermission('view:pages'), (req, res) => getPage(db, req as AuthRequest, res));
  router.post('/', requirePermission('create:pages'), (req, res) => createPage(db, req as AuthRequest, res));
  router.put('/:id', requirePermission('edit:pages'), (req, res) => updatePage(db, req as AuthRequest, res));
  router.delete('/:id', requirePermission('delete:pages'), (req, res) => deletePage(db, req as AuthRequest, res));
  router.post('/reorder', requirePermission('edit:pages'), (req, res) => reorderPages(db, req as AuthRequest, res));
  router.post('/:id/publish', requirePermission('publish:pages'), (req, res) => publishPage(db, req as AuthRequest, res));
  router.post('/:id/unpublish', requirePermission('publish:pages'), (req, res) => unpublishPage(db, req as AuthRequest, res));

  return router;
}
