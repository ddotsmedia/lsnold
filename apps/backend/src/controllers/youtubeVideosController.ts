import type { Response } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import { logActivity } from '../utils/activityLog.js';

export interface YoutubeVideo {
  id: string;
  title: string;
  description: string | null;
  youtube_url: string;
  youtube_id: string;
  thumbnail_url: string | null;
  display_order: number;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** YouTube ids are 11 chars of [A-Za-z0-9_-]. */
const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/**
 * Pulls the video id out of the URL shapes people actually paste:
 *   youtube.com/watch?v=ID           youtu.be/ID
 *   youtube.com/embed/ID             youtube.com/shorts/ID
 *   youtube.com/live/ID              youtube.com/v/ID
 *   m.youtube.com/..., with or without scheme, extra query params or timestamps
 * Returns null when nothing valid is found, so callers can reject rather than
 * store a row that renders a broken player.
 */
export function extractYoutubeId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  // A bare id pasted on its own.
  if (ID_PATTERN.test(raw)) return raw;

  let url: URL;
  try {
    url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '');
  const isYoutube =
    host === 'youtube.com' ||
    host === 'youtu.be' ||
    host === 'youtube-nocookie.com' ||
    host.endsWith('.youtube.com');
  if (!isYoutube) return null;

  if (host === 'youtu.be') {
    const candidate = url.pathname.split('/').filter(Boolean)[0];
    return candidate && ID_PATTERN.test(candidate) ? candidate : null;
  }

  const v = url.searchParams.get('v');
  if (v && ID_PATTERN.test(v)) return v;

  const segments = url.pathname.split('/').filter(Boolean);
  const marker = segments.findIndex((s) => ['embed', 'shorts', 'live', 'v'].includes(s));
  if (marker !== -1) {
    const candidate = segments[marker + 1];
    if (candidate && ID_PATTERN.test(candidate)) return candidate;
  }

  return null;
}

export function thumbnailFor(youtubeId: string): string {
  return `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;
}

const CreateSchema = z.object({
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().max(4000).optional(),
  youtube_url: z.string().trim().min(1).max(2000),
  thumbnail_url: z.string().trim().url().max(2000).optional(),
  display_order: z.number().int().min(0).max(9999).optional(),
  // Which public page shows this video. Null unassigns it — an empty string
  // from a "None" dropdown option means the same thing.
  page_slug: z.string().trim().max(100).nullable().optional()
    .transform((v) => (v ? v : null)),
});

const UpdateSchema = CreateSchema.partial();

/** Live videos for the public gallery. */
export async function listPublicYoutubeVideos(
  db: Pool,
  _req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const result = await db.query(
      // page_slug is returned so a caller can pick out the video for one page
      // without a second endpoint; the gallery ignores it.
      `SELECT id, title, description, youtube_url, youtube_id, thumbnail_url, display_order, page_slug
       FROM youtube_videos
       WHERE deleted_at IS NULL
       ORDER BY display_order ASC, created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('listPublicYoutubeVideos failed', error);
    res.status(500).json({ error: 'Failed to fetch videos' });
  }
}

export async function listYoutubeVideos(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const showDeleted = req.query.deleted === 'true';
    const result = await db.query(
      `SELECT yv.*, u.name AS uploaded_by_name
       FROM youtube_videos yv
       LEFT JOIN users u ON yv.uploaded_by = u.id
       WHERE yv.deleted_at IS ${showDeleted ? 'NOT NULL' : 'NULL'}
       ORDER BY yv.display_order ASC, yv.created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('listYoutubeVideos failed', error);
    res.status(500).json({ error: 'Failed to fetch videos' });
  }
}

export async function createYoutubeVideo(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const data = CreateSchema.parse(req.body);

    const youtubeId = extractYoutubeId(data.youtube_url);
    if (!youtubeId) {
      res.status(400).json({
        error: 'Could not read a YouTube video id from that link',
        details: 'Paste a link such as https://www.youtube.com/watch?v=… or https://youtu.be/…',
      });
      return;
    }

    const result = await db.query(
      `INSERT INTO youtube_videos
         (title, description, youtube_url, youtube_id, thumbnail_url, display_order, uploaded_by, page_slug)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        data.title,
        data.description ?? null,
        data.youtube_url,
        youtubeId,
        data.thumbnail_url ?? thumbnailFor(youtubeId),
        data.display_order ?? 0,
        req.userId ?? null,
        data.page_slug ?? null,
      ]
    );
    const row = result.rows[0] as YoutubeVideo;

    await logActivity(db, req.userId, 'create', 'youtube_video', row.id, {
      newValues: row as unknown as Record<string, unknown>,
      req,
    });
    res.status(201).json(row);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
      return;
    }
    if ((error as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'That video has already been added' });
      return;
    }
    console.error('createYoutubeVideo failed', error);
    res.status(500).json({ error: 'Failed to add video' });
  }
}

export async function updateYoutubeVideo(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const data = UpdateSchema.parse(req.body);

    const existing = await db.query(
      'SELECT * FROM youtube_videos WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Video not found' });
      return;
    }

    let youtubeId: string | null = null;
    if (data.youtube_url) {
      youtubeId = extractYoutubeId(data.youtube_url);
      if (!youtubeId) {
        res.status(400).json({ error: 'Could not read a YouTube video id from that link' });
        return;
      }
    }

    const result = await db.query(
      `UPDATE youtube_videos SET
         title = COALESCE($2, title),
         description = COALESCE($3, description),
         youtube_url = COALESCE($4, youtube_url),
         youtube_id = COALESCE($5, youtube_id),
         thumbnail_url = COALESCE($6, thumbnail_url),
         display_order = COALESCE($7, display_order),
         -- Not COALESCE: null is a meaningful value here (unassign the video),
         -- and COALESCE cannot tell "set to null" from "leave alone". The flag
         -- says whether the caller sent the field at all.
         page_slug = CASE WHEN $8::boolean THEN $9 ELSE page_slug END,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING *`,
      [
        id,
        data.title ?? null,
        data.description ?? null,
        data.youtube_url ?? null,
        youtubeId,
        // Re-derive the thumbnail when the video changed and none was given.
        data.thumbnail_url ?? (youtubeId ? thumbnailFor(youtubeId) : null),
        data.display_order ?? null,
        Object.prototype.hasOwnProperty.call(req.body ?? {}, 'page_slug'),
        data.page_slug ?? null,
      ]
    );

    await logActivity(db, req.userId, 'update', 'youtube_video', id, {
      oldValues: existing.rows[0] as Record<string, unknown>,
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
      res.status(409).json({ error: 'That video has already been added' });
      return;
    }
    console.error('updateYoutubeVideo failed', error);
    res.status(500).json({ error: 'Failed to update video' });
  }
}

export async function deleteYoutubeVideo(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const result = await db.query(
      `UPDATE youtube_videos SET deleted_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Video not found' });
      return;
    }
    await logActivity(db, req.userId, 'delete', 'youtube_video', id, {
      oldValues: result.rows[0] as Record<string, unknown>,
      req,
    });
    res.status(204).send();
  } catch (error) {
    console.error('deleteYoutubeVideo failed', error);
    res.status(500).json({ error: 'Failed to delete video' });
  }
}

export async function restoreYoutubeVideo(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const result = await db.query(
      `UPDATE youtube_videos SET deleted_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND deleted_at IS NOT NULL RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'No deleted video with that id' });
      return;
    }
    await logActivity(db, req.userId, 'restore', 'youtube_video', id, {
      newValues: result.rows[0] as Record<string, unknown>,
      req,
    });
    res.json(result.rows[0]);
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'That video is already live' });
      return;
    }
    console.error('restoreYoutubeVideo failed', error);
    res.status(500).json({ error: 'Failed to restore video' });
  }
}
