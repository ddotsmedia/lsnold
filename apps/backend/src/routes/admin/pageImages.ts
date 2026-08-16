import express from 'express';
import type { Response } from 'express';
import type { Pool } from 'pg';
import multer from 'multer';
import { cloudinary, isCloudinaryConfigured } from '../../config/cloudinary.js';
import { authenticate, createResolveAdmin, requireAdmin } from '../../middleware/auth.js';
import { createResolvePermissions, requirePermission, requirePanelAccess } from '../../middleware/permissions.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { logActivity } from '../../utils/activityLog.js';

/**
 * Image slots for a page, addressed by page id.
 *
 * Storage is page_media, the table migration 015 already created — not a
 * separate page_images table. Two tables describing the same relationship would
 * drift, and an image set here would be invisible in the Media Library.
 *
 * The slug used in page_media comes from the page's `path`, not its `slug`
 * column: path is what the public route is, and the public hooks already fetch
 * by route name (usePageMedia('nursery')). The pages table calls that same row
 * "about", so keying on slug would split one page's images in two.
 */

// 'about' is the home page's intro tile. It is accepted for every page rather
// than only home; the admin only offers it where something renders it.
const SLOTS = [
  'hero', 'hero_2', 'hero_3', 'hero_4', 'hero_5',
  'feature_1', 'feature_2', 'feature_3', 'background', 'gallery', 'about',
] as const;

/** Accepts feature1 as well as feature_1, and stores the underscored form. */
function normaliseSlot(raw: string): string | null {
  const value = raw.trim().toLowerCase().replace(/^feature(\d+)$/, 'feature_$1');
  return (SLOTS as readonly string[]).includes(value) ? value : null;
}

/** '/'-rooted path to the slug page_media stores. '/' becomes 'home'. */
function mediaSlugFromPath(path: string | null, fallbackSlug: string): string {
  if (!path) return fallbackSlug;
  const trimmed = path.replace(/^\/+|\/+$/g, '');
  return trimmed === '' ? 'home' : trimmed;
}

async function resolvePage(
  db: Pool,
  id: string
): Promise<{ id: string; title: string; mediaSlug: string } | null> {
  // Accept an id or a slug, so a caller holding either can address the page.
  const result = await db.query(
    `SELECT id, title, slug, path FROM pages
      WHERE deleted_at IS NULL AND (slug = $1 OR id::text = $1)
      LIMIT 1`,
    [id]
  );
  const row = result.rows[0] as { id: string; title: string; slug: string; path: string | null } | undefined;
  if (!row) return null;
  return { id: row.id, title: row.title, mediaSlug: mediaSlugFromPath(row.path, row.slug) };
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype?.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

const handleUpload: express.RequestHandler = (req, res, next) => {
  upload.single('file')(req, res, (err: unknown) => {
    if (!err) { next(); return; }
    const message = err instanceof Error ? err.message : 'Upload failed';
    const tooBig = message.includes('File too large');
    res.status(400).json({ error: tooBig ? 'Image must be 10 MB or smaller' : message });
  });
};

interface CloudinaryUploadResult {
  secure_url: string;
  public_id: string;
  asset_id?: string;
  width?: number;
  height?: number;
  bytes?: number;
}

function altFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
  if (!base) return 'Page image';
  return base.charAt(0).toUpperCase() + base.slice(1);
}

// ------------------------------------------------------------------- handlers

async function listImages(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const page = await resolvePage(db, req.params.id as string);
    if (!page) { res.status(404).json({ error: 'Page not found' }); return; }

    const result = await db.query(
      `SELECT p.id AS assignment_id, p.media_section AS slot,
              m.id AS media_id, m.url, m.alt_text, m.title, m.width, m.height, m.file_size
         FROM page_media p
         JOIN media m ON m.id = p.media_id AND m.deleted_at IS NULL
        WHERE p.page_slug = $1 AND p.deleted_at IS NULL`,
      [page.mediaSlug]
    );

    // Every known slot is returned, empty ones as null, so the editor can render
    // the full set without knowing which exist.
    const slots: Record<string, unknown> = {};
    for (const slot of SLOTS) slots[slot] = null;
    for (const row of result.rows as Record<string, unknown>[]) {
      slots[row.slot as string] = row;
    }

    res.json({ pageId: page.id, page: page.mediaSlug, title: page.title, slots });
  } catch (error) {
    console.error('listImages failed', error);
    res.status(500).json({ error: 'Failed to fetch page images' });
  }
}

/**
 * Uploads a file and assigns it to a slot, replacing whatever was there. Used
 * by both POST (slot in the body) and PUT (slot in the path).
 */
async function assignUploaded(db: Pool, req: AuthRequest, res: Response, slotFromPath?: string): Promise<void> {
  try {
    const page = await resolvePage(db, req.params.id as string);
    if (!page) { res.status(404).json({ error: 'Page not found' }); return; }

    const raw = slotFromPath ?? (req.body as Record<string, string>)?.slot ?? 'hero';
    const slot = normaliseSlot(raw);
    if (!slot) {
      res.status(400).json({ error: `Unknown slot "${raw}". Valid slots: ${SLOTS.join(', ')}` });
      return;
    }

    if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }
    if (!isCloudinaryConfigured()) {
      res.status(503).json({ error: 'Image hosting is not configured. Set CLOUDINARY_URL.' });
      return;
    }

    const uploaded = await new Promise<CloudinaryUploadResult>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'bayrotna/pages',
          resource_type: 'image',
          tags: ['media', 'pages', page.mediaSlug, slot],
          transformation: [{ width: 2560, height: 2560, crop: 'limit' }],
        },
        (error, result) => {
          if (error || !result) { reject(error ?? new Error('Upload failed')); return; }
          resolve(result as CloudinaryUploadResult);
        }
      );
      stream.end(req.file!.buffer);
    });

    const url = cloudinary.url(uploaded.public_id, { secure: true, fetch_format: 'auto', quality: 'auto' });
    const body = req.body as Record<string, string | undefined>;
    const alt = (body?.alt_text || '').trim() || altFromFilename(req.file.originalname);

    const media = await db.query(
      `INSERT INTO media
         (title, url, cloudinary_id, cloudinary_public_id, file_size, mime_type,
          width, height, alt_text, category, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pages',$10) RETURNING *`,
      [
        (body?.title || '').trim() || altFromFilename(req.file.originalname),
        url, uploaded.asset_id ?? null, uploaded.public_id,
        uploaded.bytes ?? req.file.size ?? null, req.file.mimetype,
        uploaded.width ?? null, uploaded.height ?? null, alt, req.userId ?? null,
      ]
    );
    const mediaRow = media.rows[0] as { id: string };

    // Release the current occupant before inserting, so the slot's partial
    // unique index is never violated. The old image stays in the library.
    await db.query(
      `UPDATE page_media SET deleted_at = CURRENT_TIMESTAMP
        WHERE page_slug = $1 AND media_section = $2 AND deleted_at IS NULL`,
      [page.mediaSlug, slot]
    );

    const assignment = await db.query(
      `INSERT INTO page_media (page_slug, media_id, media_section) VALUES ($1,$2,$3) RETURNING *`,
      [page.mediaSlug, mediaRow.id, slot]
    );

    await logActivity(db, req.userId, 'upload', 'page_media', assignment.rows[0]?.id as string, {
      newValues: { page: page.mediaSlug, slot, media_id: mediaRow.id }, req,
    });

    res.status(201).json({
      pageId: page.id, page: page.mediaSlug, slot,
      assignment_id: assignment.rows[0]?.id,
      media_id: mediaRow.id,
      ...media.rows[0] as Record<string, unknown>,
    });
  } catch (error) {
    console.error('assignUploaded failed', error);
    res.status(500).json({ error: 'Failed to upload page image' });
  }
}

async function removeImage(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const page = await resolvePage(db, req.params.id as string);
    if (!page) { res.status(404).json({ error: 'Page not found' }); return; }

    const slot = normaliseSlot(req.params.slot as string);
    if (!slot) {
      res.status(400).json({ error: `Unknown slot "${req.params.slot}". Valid slots: ${SLOTS.join(', ')}` });
      return;
    }

    // Clears the slot but keeps the image in the library, since the same file
    // may be used elsewhere. Deleting the file itself is the library's job.
    const result = await db.query(
      `UPDATE page_media SET deleted_at = CURRENT_TIMESTAMP
        WHERE page_slug = $1 AND media_section = $2 AND deleted_at IS NULL RETURNING *`,
      [page.mediaSlug, slot]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'That slot is already empty' }); return; }

    await logActivity(db, req.userId, 'delete', 'page_media', result.rows[0]?.id as string, {
      oldValues: result.rows[0] as Record<string, unknown>, req,
    });
    res.status(204).send();
  } catch (error) {
    console.error('removeImage failed', error);
    res.status(500).json({ error: 'Failed to remove page image' });
  }
}

export function createAdminPageImagesRouter(db: Pool): express.Router {
  // mergeParams so :id from the parent mount is visible here.
  const router = express.Router({ mergeParams: true });
  const resolveAdmin = createResolveAdmin(db);

  router.use(authenticate, resolveAdmin, createResolvePermissions(db), requirePanelAccess);

  router.get('/', requirePermission('view:pages'), (req, res) => listImages(db, req as AuthRequest, res));
  router.post('/', requirePermission('edit:pages'), handleUpload, (req, res) => assignUploaded(db, req as AuthRequest, res));
  router.put('/:slot', requirePermission('edit:pages'), handleUpload, (req, res) =>
    assignUploaded(db, req as AuthRequest, res, req.params.slot)
  );
  router.delete('/:slot', requirePermission('edit:pages'), (req, res) => removeImage(db, req as AuthRequest, res));

  return router;
}
