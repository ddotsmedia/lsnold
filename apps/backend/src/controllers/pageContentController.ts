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

    // Live means: visible, written into, and its publish moment has passed.
    // COALESCE lets a scheduled section appear by itself when the time comes,
    // so the site does not depend on a job having run.
    const result = await db.query(
      `SELECT id, section_key, title, content, sort_order
         FROM page_content_sections
        WHERE page_id = $1 AND deleted_at IS NULL AND is_visible = TRUE
          AND content IS NOT NULL AND btrim(content) <> ''
          AND COALESCE(published_at, scheduled_publish_at) IS NOT NULL
          AND COALESCE(published_at, scheduled_publish_at) <= NOW()
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

// ------------------------------------------------------------- publishing

/**
 * The four publish transitions, as the SQL each one applies.
 *
 * Kept as data rather than four near-identical handlers: they differ only in
 * which two columns they set, and writing them out separately is how the set
 * drifts apart later.
 */
const TRANSITIONS = {
  publish: { sql: 'published_at = NOW(), scheduled_publish_at = NULL', verb: 'published' },
  unpublish: { sql: 'published_at = NULL', verb: 'unpublished' },
  unschedule: { sql: 'scheduled_publish_at = NULL', verb: 'unscheduled' },
} as const;

type TransitionName = keyof typeof TRANSITIONS;

async function applyTransition(
  db: Pool,
  req: AuthRequest,
  res: Response,
  name: TransitionName
): Promise<void> {
  try {
    const pageId = await resolvePageId(db, req.params.pageId as string);
    if (!pageId) { res.status(404).json({ error: 'Page not found' }); return; }

    const result = await db.query(
      `UPDATE page_content_sections SET ${TRANSITIONS[name].sql}, updated_by = $1
        WHERE id = $2 AND page_id = $3 AND deleted_at IS NULL RETURNING *`,
      [req.userId ?? null, req.params.sectionId, pageId]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Section not found' }); return; }

    await logActivity(db, req.userId, 'update', 'page_content_section', req.params.sectionId as string, {
      newValues: { action: TRANSITIONS[name].verb }, req,
    });
    res.json(result.rows[0]);
  } catch (error) {
    console.error(`Error running ${name} on section:`, error);
    res.status(500).json({ error: `Failed to ${name} section` });
  }
}

export const publishSection = (db: Pool, req: AuthRequest, res: Response) =>
  applyTransition(db, req, res, 'publish');
export const unpublishSection = (db: Pool, req: AuthRequest, res: Response) =>
  applyTransition(db, req, res, 'unpublish');
export const unscheduleSection = (db: Pool, req: AuthRequest, res: Response) =>
  applyTransition(db, req, res, 'unschedule');

const ScheduleSchema = z.object({
  scheduled_publish_at: z.string().datetime({ offset: true }).or(z.string().min(1)),
});

/** Scheduling is separate: it carries a value and the value must be in future. */
export async function scheduleSection(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const pageId = await resolvePageId(db, req.params.pageId as string);
    if (!pageId) { res.status(404).json({ error: 'Page not found' }); return; }

    const { scheduled_publish_at: raw } = ScheduleSchema.parse(req.body);
    const when = new Date(raw);
    if (Number.isNaN(when.getTime())) {
      res.status(400).json({ error: 'scheduled_publish_at is not a valid date' });
      return;
    }
    if (when.getTime() <= Date.now()) {
      // Scheduling into the past would publish immediately, which is what the
      // Publish button is for. Saying so is clearer than silently doing it.
      res.status(400).json({ error: 'Choose a time in the future, or use Publish now.' });
      return;
    }

    // published_at is cleared: a section cannot be simultaneously live and
    // waiting to go live, and leaving it set would keep it on the site.
    const result = await db.query(
      `UPDATE page_content_sections
          SET scheduled_publish_at = $1, published_at = NULL, updated_by = $2
        WHERE id = $3 AND page_id = $4 AND deleted_at IS NULL RETURNING *`,
      [when.toISOString(), req.userId ?? null, req.params.sectionId, pageId]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Section not found' }); return; }

    await logActivity(db, req.userId, 'update', 'page_content_section', req.params.sectionId as string, {
      newValues: { action: 'scheduled', scheduled_publish_at: when.toISOString() }, req,
    });
    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
      return;
    }
    console.error('Error scheduling section:', error);
    res.status(500).json({ error: 'Failed to schedule section' });
  }
}

const BulkSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  action: z.enum(['publish', 'unpublish']),
});

/**
 * Publishes or unpublishes several sections at once. One statement rather than
 * a request per section: the admin screen selects checkboxes, and looping would
 * both be slower and leave a half-applied state if one call failed.
 */
export async function bulkPublish(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const pageId = await resolvePageId(db, req.params.pageId as string);
    if (!pageId) { res.status(404).json({ error: 'Page not found' }); return; }

    const { ids, action } = BulkSchema.parse(req.body);
    const result = await db.query(
      `UPDATE page_content_sections
          SET ${TRANSITIONS[action].sql}, updated_by = $1
        WHERE id = ANY($2::uuid[]) AND page_id = $3 AND deleted_at IS NULL
        RETURNING id`,
      [req.userId ?? null, ids, pageId]
    );

    await logActivity(db, req.userId, 'update', 'page_content_section', ids[0] as string, {
      newValues: { action: `bulk_${TRANSITIONS[action].verb}`, count: result.rowCount ?? 0 }, req,
    });
    // The count of rows touched, not of ids sent — ids for another page match
    // nothing, and reporting the request length would hide that.
    res.json({ updated: result.rowCount ?? 0, requested: ids.length });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
      return;
    }
    console.error('Error bulk publishing sections:', error);
    res.status(500).json({ error: 'Failed to update sections' });
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
