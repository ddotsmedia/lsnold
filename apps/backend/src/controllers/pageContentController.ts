import type { Response } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import { logActivity } from '../utils/activityLog.js';
import { sanitizeHtml } from '../utils/sanitizeHtml.js';

/**
 * Editable text sections for the public pages.
 *
 * `content` is rendered as HTML on the public site, so it is sanitised against
 * an allowlist on the way in — see utils/sanitizeHtml.
 */

const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

const SectionSchema = z.object({
  // Hyphens stay allowed: the admin form slugifies what is typed into them, and
  // the seeded keys use them. The added rule is that a key cannot be made only
  // of separators — '-' and '___' passed the old pattern and read as blank.
  section_key: z.string().trim().min(1).max(50).regex(
    /^[a-z0-9]+([a-z0-9_-]*[a-z0-9])?$/,
    'Section key must start and end with a letter or number, and may contain hyphens and underscores between'
  ),
  title: z.preprocess(blankToNull, z.string().trim().max(255).nullable().optional()),
  content: z.preprocess(blankToNull, z.string().max(50000).nullable().optional()),
  is_visible: z.boolean().optional(),
  sort_order: z.number().int().min(0).optional(),
});

/** Accepts a page id or a slug, so a caller holding either can address it. */
async function resolvePageId(db: Pool, idOrSlug: string): Promise<string | null> {
  const result = await db.query(
    `SELECT id FROM pages WHERE deleted_at IS NULL AND (id::text = $1 OR slug = $1) LIMIT 1`,
    [idOrSlug]
  );
  return (result.rows[0] as { id?: string } | undefined)?.id ?? null;
}

// ------------------------------------------------------------------- read

/**
 * Public read: only visible sections that actually have content. An empty
 * section is a placeholder waiting to be written, not something to render.
 */
export async function listPublicSections(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const pageId = await resolvePageId(db, req.params.pageId as string);
    if (!pageId) { res.json([]); return; }

    const result = await db.query(
      `SELECT id, section_key, title, content, sort_order
         FROM page_content_sections
        WHERE page_id = $1 AND deleted_at IS NULL AND is_visible = TRUE
          AND content IS NOT NULL AND btrim(content) <> ''
        ORDER BY sort_order ASC, created_at ASC`,
      [pageId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching page content:', error);
    // A content failure must not break the page; it falls back to its own copy.
    res.json([]);
  }
}

/** Admin read: every section, including empty and hidden ones. */
export async function listSections(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const pageId = await resolvePageId(db, req.params.pageId as string);
    if (!pageId) { res.status(404).json({ error: 'Page not found' }); return; }

    const showDeleted = req.query.deleted === 'true';
    const result = await db.query(
      `SELECT s.*, u.name AS updated_by_name
         FROM page_content_sections s
         LEFT JOIN users u ON u.id = s.updated_by
        WHERE s.page_id = $1 AND s.deleted_at IS ${showDeleted ? 'NOT NULL' : 'NULL'}
        ORDER BY s.sort_order ASC, s.created_at ASC`,
      [pageId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching page content:', error);
    res.status(500).json({ error: 'Failed to fetch content' });
  }
}

// ------------------------------------------------------------------ write

export async function createSection(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const pageId = await resolvePageId(db, req.params.pageId as string);
    if (!pageId) { res.status(404).json({ error: 'Page not found' }); return; }

    const data = SectionSchema.parse(req.body);

    const next = await db.query(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM page_content_sections
        WHERE page_id = $1 AND deleted_at IS NULL`,
      [pageId]
    );

    const result = await db.query(
      `INSERT INTO page_content_sections
         (page_id, section_key, title, content, is_visible, sort_order, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7) RETURNING *`,
      [
        pageId, data.section_key, data.title ?? null,
        sanitizeHtml(data.content ?? null), data.is_visible ?? true,
        data.sort_order ?? (next.rows[0] as { next: number }).next,
        req.userId ?? null,
      ]
    );

    await logActivity(db, req.userId, 'create', 'page_content_section', result.rows[0]?.id as string, {
      newValues: result.rows[0] as Record<string, unknown>, req,
    });
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
      return;
    }
    if ((error as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'That section key is already used on this page' });
      return;
    }
    console.error('Error creating content section:', error);
    res.status(500).json({ error: 'Failed to create section' });
  }
}

export async function updateSection(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { sectionId } = req.params;
    // The page in the path is part of the identity of the section, not
    // decoration. Without it a stale tab or a mistyped id edits another page's
    // text and reports success.
    const pageId = await resolvePageId(db, req.params.pageId as string);
    if (!pageId) { res.status(404).json({ error: 'Page not found' }); return; }

    const data = SectionSchema.partial().parse(req.body);

    const before = await db.query(
      'SELECT * FROM page_content_sections WHERE id = $1 AND page_id = $2 AND deleted_at IS NULL',
      [sectionId, pageId]
    );
    if (before.rows.length === 0) { res.status(404).json({ error: 'Section not found' }); return; }

    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    // Assigned explicitly rather than with COALESCE: COALESCE cannot tell
    // "leave this alone" from "clear this", so clearing a title was impossible.
    if (data.title !== undefined) { sets.push(`title = $${idx++}`); params.push(data.title ?? null); }
    if (data.content !== undefined) { sets.push(`content = $${idx++}`); params.push(sanitizeHtml(data.content ?? null)); }
    if (data.is_visible !== undefined) { sets.push(`is_visible = $${idx++}`); params.push(data.is_visible); }
    if (data.sort_order !== undefined) { sets.push(`sort_order = $${idx++}`); params.push(data.sort_order); }
    if (data.section_key !== undefined) { sets.push(`section_key = $${idx++}`); params.push(data.section_key); }

    if (sets.length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }
    sets.push(`updated_by = $${idx++}`);
    params.push(req.userId ?? null);

    params.push(sectionId, pageId);
    const result = await db.query(
      `UPDATE page_content_sections SET ${sets.join(', ')}
        WHERE id = $${idx} AND page_id = $${idx + 1} AND deleted_at IS NULL RETURNING *`,
      params
    );

    await logActivity(db, req.userId, 'update', 'page_content_section', sectionId as string, {
      oldValues: before.rows[0] as Record<string, unknown>,
      newValues: result.rows[0] as Record<string, unknown>,
      req,
    });
    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
      return;
    }
    if ((error as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'That section key is already used on this page' });
      return;
    }
    console.error('Error updating section:', error);
    res.status(500).json({ error: 'Failed to update section' });
  }
}

export async function deleteSection(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { sectionId } = req.params;
    const pageId = await resolvePageId(db, req.params.pageId as string);
    if (!pageId) { res.status(404).json({ error: 'Page not found' }); return; }

    const result = await db.query(
      `UPDATE page_content_sections SET deleted_at = NOW(), updated_by = $1
        WHERE id = $2 AND page_id = $3 AND deleted_at IS NULL RETURNING *`,
      [req.userId ?? null, sectionId, pageId]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Section not found' }); return; }

    await logActivity(db, req.userId, 'delete', 'page_content_section', sectionId as string, {
      oldValues: result.rows[0] as Record<string, unknown>, req,
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting section:', error);
    res.status(500).json({ error: 'Failed to delete section' });
  }
}

export async function restoreSection(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  // Held outside the try so the collision handler below can name the key.
  let sectionKey: string | null = null;
  try {
    const { sectionId } = req.params;
    // Resolving the page also refuses a restore onto a page that has itself
    // been deleted — the section would come back somewhere nobody can reach.
    const pageId = await resolvePageId(db, req.params.pageId as string);
    if (!pageId) { res.status(404).json({ error: 'Page not found' }); return; }

    // Read the key first so the collision message can name it.
    const target = await db.query(
      `SELECT section_key FROM page_content_sections
        WHERE id = $1 AND page_id = $2 AND deleted_at IS NOT NULL`,
      [sectionId, pageId]
    );
    if (target.rows.length === 0) { res.status(404).json({ error: 'No deleted section with that id' }); return; }
    sectionKey = (target.rows[0] as { section_key: string }).section_key;

    const result = await db.query(
      `UPDATE page_content_sections SET deleted_at = NULL, updated_by = $1
        WHERE id = $2 AND page_id = $3 AND deleted_at IS NOT NULL RETURNING *`,
      [req.userId ?? null, sectionId, pageId]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'No deleted section with that id' }); return; }

    await logActivity(db, req.userId, 'restore', 'page_content_section', sectionId as string, {
      newValues: result.rows[0] as Record<string, unknown>, req,
    });
    res.json(result.rows[0]);
  } catch (error) {
    // Restoring onto a key that has since been reused hits the unique index.
    if ((error as { code?: string }).code === '23505') {
      res.status(409).json({
        error: `Cannot restore: section key ${sectionKey ? `'${sectionKey}' ` : ''}is already in use on this page. `
          + 'Delete or rename the current section first.',
      });
      return;
    }
    console.error('Error restoring section:', error);
    res.status(500).json({ error: 'Failed to restore section' });
  }
}

const ReorderSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) });

export async function reorderSections(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const pageId = await resolvePageId(db, req.params.pageId as string);
    if (!pageId) { res.status(404).json({ error: 'Page not found' }); return; }

    const { ids } = ReorderSchema.parse(req.body);
    // One statement, so a half-applied order is impossible.
    const result = await db.query(
      `UPDATE page_content_sections AS s
          SET sort_order = v.ord, updated_by = $3
         FROM (SELECT unnest($1::uuid[]) AS id, generate_subscripts($1::uuid[], 1) AS ord) AS v
        WHERE s.id = v.id AND s.page_id = $2 AND s.deleted_at IS NULL`,
      [ids, pageId, req.userId ?? null]
    );

    // The rows actually touched, not the length of the request. Ids belonging
    // to another page match nothing, and answering with the input length
    // reported a silent no-op as success.
    const reordered = result.rowCount ?? 0;
    res.json({ reordered, requested: ids.length });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
      return;
    }
    console.error('Error reordering sections:', error);
    res.status(500).json({ error: 'Failed to reorder sections' });
  }
}
