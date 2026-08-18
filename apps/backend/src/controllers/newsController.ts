import type { Response } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import { parseSort } from '../utils/sorting.js';
import { logActivity } from '../utils/activityLog.js';
import { cloudinary, isCloudinaryConfigured } from '../config/cloudinary.js';

export interface NewsItem {
  id: string;
  title: string;
  description: string;
  published_date: string;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

/** '' from an untouched form field means "not set", not a value to store. */
const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

/**
 * Same minimums the admin form enforces client-side, so a hand-rolled request
 * cannot store something the UI would have rejected.
 */
const NewsSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(255),
  description: z.string().trim().min(10, 'Description must be at least 10 characters'),
  // Any date: news is normally backdated to when it happened, and there is no
  // reason to forbid announcing something dated ahead.
  published_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  is_published: z.preprocess(blankToNull, z.boolean().nullable().optional()),
});

// ----------------------------------------------------------------- images

interface CloudinaryImage {
  secure_url: string;
  public_id: string;
}

/**
 * Uploads under a public_id fixed to the news item, with overwrite. Replacing
 * an image therefore replaces the file rather than leaving the old one behind
 * as an orphan, which a timestamped id would.
 */
export async function uploadNewsImage(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const existing = await db.query(
      'SELECT id, title, cloudinary_id FROM news WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    if (existing.rows.length === 0) { res.status(404).json({ error: 'News item not found' }); return; }

    if (!req.file) { res.status(400).json({ error: 'No image file provided' }); return; }
    if (!isCloudinaryConfigured()) {
      res.status(503).json({ error: 'Image hosting is not configured. Set CLOUDINARY_URL.' });
      return;
    }

    const uploaded = await new Promise<CloudinaryImage>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'bayrotna/news',
          public_id: `news_${id}`,
          overwrite: true,
          // Purges the cached copy of the previous image, which would otherwise
          // keep being served from the same URL for hours.
          invalidate: true,
          resource_type: 'image',
          tags: ['news'],
          transformation: [{ width: 2000, height: 2000, crop: 'limit' }],
        },
        (error, result) => {
          if (error || !result) { reject(error ?? new Error('Upload failed')); return; }
          resolve(result as CloudinaryImage);
        }
      );
      stream.end(req.file!.buffer);
    });

    const url = cloudinary.url(uploaded.public_id, {
      secure: true, fetch_format: 'auto', quality: 'auto', version: Date.now(),
    });

    const updated = await db.query(
      `UPDATE news SET image_url = $1, cloudinary_id = $2, uploaded_by = $3
        WHERE id = $4 AND deleted_at IS NULL RETURNING *`,
      [url, uploaded.public_id, req.userId ?? null, id]
    );

    await logActivity(db, req.userId, 'upload', 'news', id as string, {
      details: { image_url: url, cloudinary_id: uploaded.public_id },
      req,
    });

    res.json({ success: true, news: updated.rows[0], imageUrl: url });
  } catch (error) {
    console.error('News image upload error:', error);
    const detail = (error as { message?: string })?.message;
    res.status(500).json({
      error: 'Failed to upload image',
      details: typeof detail === 'string' ? detail : undefined,
    });
  }
}

export async function deleteNewsImage(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const existing = await db.query(
      'SELECT cloudinary_id FROM news WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    if (existing.rows.length === 0) { res.status(404).json({ error: 'News item not found' }); return; }

    const { cloudinary_id: publicId } = existing.rows[0] as { cloudinary_id: string | null };

    // The row is cleared first: an orphaned remote file is a smaller problem
    // than a row pointing at an image that no longer exists.
    const updated = await db.query(
      `UPDATE news SET image_url = NULL, cloudinary_id = NULL, uploaded_by = NULL
        WHERE id = $1 RETURNING *`,
      [id]
    );

    if (publicId) {
      try {
        await cloudinary.uploader.destroy(publicId, { invalidate: true });
      } catch (error) {
        console.error(`cloudinary destroy failed for ${publicId}`, error);
      }
    }

    await logActivity(db, req.userId, 'delete', 'news', id as string, {
      details: { action: 'image_removed', cloudinary_id: publicId },
      req,
    });

    res.json({ success: true, news: updated.rows[0] });
  } catch (error) {
    console.error('News image delete error:', error);
    res.status(500).json({ error: 'Failed to delete image' });
  }
}

// ---------------------------------------------------------------- public

/** Published, undeleted news, newest first. Feeds the site's News section. */
export async function listPublicNews(db: Pool, _req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await db.query(
      `SELECT id, title, description, published_date, image_url, created_at
         FROM news
        WHERE deleted_at IS NULL AND is_published = TRUE
        ORDER BY published_date DESC, created_at DESC`
    );
    res.json(result.rows as NewsItem[]);
  } catch (error) {
    console.error('listPublicNews failed', error);
    res.status(500).json({ error: 'Failed to fetch news' });
  }
}

// ---------------------------------------------------------------- admin

export async function listNews(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const search = req.query.search as string | undefined;

    // ?deleted=true shows the soft-deleted rows so they can be restored.
    const showDeleted = req.query.deleted === 'true';
    const conditions: string[] = [showDeleted ? 'deleted_at IS NOT NULL' : 'deleted_at IS NULL'];
    const params: unknown[] = [];
    let idx = 1;

    if (search) {
      conditions.push(`(LOWER(title) LIKE $${idx} OR LOWER(description) LIKE $${idx})`);
      params.push(`%${search.toLowerCase()}%`);
      idx++;
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const countResult = await db.query(`SELECT COUNT(*) FROM news ${where}`, params);
    const total = Number(countResult.rows[0]?.count ?? 0);

    // The Title header was already marked sortable on this screen, but nothing
    // sent or read a sort parameter, so clicking it did nothing at all.
    const ALLOWED_SORTS = ['published_date', 'created_at', 'title'] as const;
    const { clause: orderBy } = parseSort(req, ALLOWED_SORTS, 'published_date');

    const dataResult = await db.query(
      `SELECT * FROM news ${where}
        ORDER BY ${orderBy}
        LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );

    res.json({
      data: dataResult.rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('listNews failed', error);
    res.status(500).json({ error: 'Failed to fetch news' });
  }
}

export async function getNews(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await db.query('SELECT * FROM news WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'News item not found' }); return; }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('getNews failed', error);
    res.status(500).json({ error: 'Failed to fetch news item' });
  }
}

export async function createNews(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const data = NewsSchema.parse(req.body);
    const result = await db.query(
      `INSERT INTO news (title, description, published_date, is_published)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [data.title, data.description, data.published_date, data.is_published ?? true]
    );
    await logActivity(db, req.userId, 'create', 'news', result.rows[0]?.id as string, {
      newValues: result.rows[0] as Record<string, unknown>,
      req,
    });
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
      return;
    }
    console.error('createNews failed', error);
    res.status(500).json({ error: 'Failed to create news item' });
  }
}

export async function updateNews(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const data = NewsSchema.partial().parse(req.body);

    const before = await db.query('SELECT * FROM news WHERE id = $1', [id]);
    if (before.rows.length === 0) { res.status(404).json({ error: 'News item not found' }); return; }

    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    for (const field of ['title', 'description', 'published_date', 'is_published'] as const) {
      if (data[field] === undefined) continue;
      sets.push(`${field} = $${idx++}`);
      // is_published is NOT NULL, so a cleared value falls back to the default.
      params.push(field === 'is_published' ? data.is_published ?? true : data[field]);
    }

    // Checked before updated_at is appended, so a request naming no real column
    // is rejected rather than silently bumping the timestamp.
    if (params.length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }
    sets.push('updated_at = CURRENT_TIMESTAMP');

    params.push(id);
    const result = await db.query(
      `UPDATE news SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    await logActivity(db, req.userId, 'update', 'news', id, {
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
    console.error('updateNews failed', error);
    res.status(500).json({ error: 'Failed to update news item' });
  }
}

export async function deleteNews(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const result = await db.query(
      `UPDATE news SET deleted_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'News item not found' }); return; }
    await logActivity(db, req.userId, 'delete', 'news', id, {
      oldValues: result.rows[0] as Record<string, unknown>,
      req,
    });
    res.status(204).send();
  } catch (error) {
    console.error('deleteNews failed', error);
    res.status(500).json({ error: 'Failed to delete news item' });
  }
}

export async function restoreNews(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const result = await db.query(
      `UPDATE news SET deleted_at = NULL
        WHERE id = $1 AND deleted_at IS NOT NULL RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'No deleted news item with that id' });
      return;
    }
    await logActivity(db, req.userId, 'restore', 'news', id, {
      newValues: result.rows[0] as Record<string, unknown>,
      req,
    });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('restoreNews failed', error);
    res.status(500).json({ error: 'Failed to restore news item' });
  }
}
