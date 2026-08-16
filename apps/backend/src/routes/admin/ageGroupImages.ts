import express from 'express';
import type { Response } from 'express';
import type { Pool } from 'pg';
import multer from 'multer';
import { z } from 'zod';
import { cloudinary, isCloudinaryConfigured } from '../../config/cloudinary.js';
import { authenticate, createResolveAdmin, requireAdmin } from '../../middleware/auth.js';
import { createResolvePermissions, requirePermission, requirePanelAccess } from '../../middleware/permissions.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { logActivity } from '../../utils/activityLog.js';

/**
 * Images for the six programmes the site advertises.
 *
 * Storage is age_group_images, created by migration 015 — not a new table. It
 * keys on a slug rather than an age_groups foreign key, deliberately: the
 * age_groups table holds four unrelated rows (Babies, Toddlers, Preschool,
 * Pre-K) that the public page never shows, and the registrations foreign key
 * points at them. Keying images off those rows would attach them to programmes
 * that appear nowhere. :id therefore accepts a programme slug, and also an
 * age_groups UUID for callers that have one.
 */

/** The programmes the public age-groups page renders, in order. */
const PROGRAMMES = [
  { slug: 'bouncing-bunnies', name: 'Bouncing Bunnies', range: '0-1 year' },
  { slug: 'precious-pandas', name: 'Precious Pandas', range: '1-2 years' },
  { slug: 'gentle-giraffes', name: 'Gentle Giraffes', range: '2-3 years' },
  { slug: 'dazzling-dolphins', name: 'Dazzling Dolphins', range: '3-4 years' },
  { slug: 'fuzzy-foxes', name: 'Fuzzy Foxes', range: '4-5 years' },
  { slug: 'cuddly-camels', name: 'Cuddly Camels', range: '4-5 years' },
] as const;

const IMAGE_TYPES = ['hero', 'icon', 'banner', 'gallery'] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

const isImageType = (v: unknown): v is ImageType =>
  typeof v === 'string' && (IMAGE_TYPES as readonly string[]).includes(v);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Turns "Bouncing Bunnies" into "bouncing-bunnies". */
const slugify = (name: string): string =>
  name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Accepts a programme slug or an age_groups UUID; returns the storage slug. */
async function resolveSlug(db: Pool, id: string): Promise<string | null> {
  const direct = PROGRAMMES.find((p) => p.slug === id);
  if (direct) return direct.slug;

  if (UUID_RE.test(id)) {
    const result = await db.query('SELECT name FROM age_groups WHERE id = $1', [id]);
    const row = result.rows[0] as { name?: string } | undefined;
    if (row?.name) return slugify(row.name);
  }
  return null;
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

function altFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
  if (!base) return 'Age group image';
  return base.charAt(0).toUpperCase() + base.slice(1);
}

// ------------------------------------------------------------------ handlers

/** The programmes, each with a count of the images attached to it. */
async function listGroups(db: Pool, _req: AuthRequest, res: Response): Promise<void> {
  try {
    const counts = await db.query(
      `SELECT a.age_group_slug AS slug,
              COUNT(*) FILTER (WHERE a.image_type = 'gallery')::int AS gallery_count,
              BOOL_OR(a.image_type = 'hero') AS has_hero,
              BOOL_OR(a.image_type = 'icon') AS has_icon
         FROM age_group_images a
         JOIN media m ON m.id = a.media_id AND m.deleted_at IS NULL
        WHERE a.deleted_at IS NULL
        GROUP BY a.age_group_slug`
    );
    const bySlug = new Map(
      (counts.rows as { slug: string }[]).map((r) => [r.slug, r])
    );

    res.json({
      data: PROGRAMMES.map((p) => ({
        ...p,
        ...(bySlug.get(p.slug) ?? { gallery_count: 0, has_hero: false, has_icon: false }),
      })),
    });
  } catch (error) {
    console.error('listGroups failed', error);
    res.status(500).json({ error: 'Failed to fetch age groups' });
  }
}

async function listImages(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const slug = await resolveSlug(db, req.params.id as string);
    if (!slug) { res.status(404).json({ error: 'Age group not found' }); return; }

    const result = await db.query(
      `SELECT a.id AS assignment_id, a.image_type, a.sort_order AS display_order,
              m.id AS media_id, m.url, m.alt_text, m.title, m.width, m.height, m.file_size
         FROM age_group_images a
         JOIN media m ON m.id = a.media_id AND m.deleted_at IS NULL
        WHERE a.age_group_slug = $1 AND a.deleted_at IS NULL
        ORDER BY a.sort_order ASC, a.created_at ASC`,
      [slug]
    );

    const images: Record<string, unknown> = { hero: null, icon: null, banner: null, gallery: [] };
    for (const row of result.rows as Record<string, unknown>[]) {
      if (row.image_type === 'gallery') (images.gallery as unknown[]).push(row);
      else images[row.image_type as string] = row;
    }
    res.json({ ageGroup: slug, images });
  } catch (error) {
    console.error('listImages failed', error);
    res.status(500).json({ error: 'Failed to fetch images' });
  }
}

async function uploadImage(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const slug = await resolveSlug(db, req.params.id as string);
    if (!slug) { res.status(404).json({ error: 'Age group not found' }); return; }

    const body = req.body as Record<string, string | undefined>;
    const rawType = body?.image_type ?? 'gallery';
    if (!isImageType(rawType)) {
      res.status(400).json({ error: `Unknown image type "${rawType}". Valid: ${IMAGE_TYPES.join(', ')}` });
      return;
    }

    if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }
    if (!isCloudinaryConfigured()) {
      res.status(503).json({ error: 'Image hosting is not configured. Set CLOUDINARY_URL.' });
      return;
    }

    const uploaded = await new Promise<{ secure_url: string; public_id: string; asset_id?: string; width?: number; height?: number; bytes?: number }>(
      (resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: 'bayrotna/age-groups',
            resource_type: 'image',
            tags: ['media', 'age-groups', slug, rawType],
            transformation: [{ width: 2560, height: 2560, crop: 'limit' }],
          },
          (error, result) => {
            if (error || !result) { reject(error ?? new Error('Upload failed')); return; }
            resolve(result as { secure_url: string; public_id: string });
          }
        );
        stream.end(req.file!.buffer);
      }
    );

    const url = cloudinary.url(uploaded.public_id, { secure: true, fetch_format: 'auto', quality: 'auto' });
    const alt = (body?.alt_text || '').trim() || altFromFilename(req.file.originalname);

    const media = await db.query(
      `INSERT INTO media
         (title, url, cloudinary_id, cloudinary_public_id, file_size, mime_type,
          width, height, alt_text, category, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'age-groups',$10) RETURNING id`,
      [
        (body?.title || '').trim() || altFromFilename(req.file.originalname),
        url, uploaded.asset_id ?? null, uploaded.public_id,
        uploaded.bytes ?? req.file.size ?? null, req.file.mimetype,
        uploaded.width ?? null, uploaded.height ?? null, alt, req.userId ?? null,
      ]
    );
    const mediaId = (media.rows[0] as { id: string }).id;

    // hero, icon and banner are single slots: release the current occupant so
    // the partial unique index is not violated and assigning reads as replace.
    if (rawType !== 'gallery') {
      await db.query(
        `UPDATE age_group_images SET deleted_at = CURRENT_TIMESTAMP
          WHERE age_group_slug = $1 AND image_type = $2 AND deleted_at IS NULL`,
        [slug, rawType]
      );
    }

    const next = await db.query(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM age_group_images
        WHERE age_group_slug = $1 AND image_type = $2 AND deleted_at IS NULL`,
      [slug, rawType]
    );

    const assignment = await db.query(
      `INSERT INTO age_group_images (age_group_slug, media_id, image_type, sort_order)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [slug, mediaId, rawType, (next.rows[0] as { next: number }).next]
    );

    await logActivity(db, req.userId, 'upload', 'age_group_image', assignment.rows[0]?.id as string, {
      newValues: { slug, image_type: rawType, media_id: mediaId }, req,
    });

    res.status(201).json({
      ageGroup: slug,
      image_type: rawType,
      assignment_id: assignment.rows[0]?.id,
      media_id: mediaId,
      url,
      alt_text: alt,
    });
  } catch (error) {
    console.error('uploadImage failed', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
}

/** Removes the assignment. The image stays in the library for reuse. */
async function removeImage(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const slug = await resolveSlug(db, req.params.id as string);
    if (!slug) { res.status(404).json({ error: 'Age group not found' }); return; }

    // imageId is the assignment id, which is what the list returns.
    const result = await db.query(
      `UPDATE age_group_images SET deleted_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND age_group_slug = $2 AND deleted_at IS NULL RETURNING *`,
      [req.params.imageId, slug]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Image not found for this age group' }); return; }

    await logActivity(db, req.userId, 'delete', 'age_group_image', req.params.imageId as string, {
      oldValues: result.rows[0] as Record<string, unknown>, req,
    });
    res.status(204).send();
  } catch (error) {
    console.error('removeImage failed', error);
    res.status(500).json({ error: 'Failed to remove image' });
  }
}

const ReorderSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) });

async function reorder(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const slug = await resolveSlug(db, req.params.id as string);
    if (!slug) { res.status(404).json({ error: 'Age group not found' }); return; }

    const { ids } = ReorderSchema.parse(req.body);
    // One statement, so a half-applied order is impossible.
    await db.query(
      `UPDATE age_group_images AS a
          SET sort_order = v.ord, updated_at = CURRENT_TIMESTAMP
         FROM (SELECT unnest($1::uuid[]) AS id, generate_subscripts($1::uuid[], 1) AS ord) AS v
        WHERE a.id = v.id AND a.age_group_slug = $2`,
      [ids, slug]
    );
    res.json({ reordered: ids.length });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
      return;
    }
    console.error('reorder failed', error);
    res.status(500).json({ error: 'Failed to reorder' });
  }
}

export function createAdminAgeGroupImagesRouter(db: Pool): express.Router {
  const router = express.Router();
  const resolveAdmin = createResolveAdmin(db);

  router.use(authenticate, resolveAdmin, createResolvePermissions(db), requirePanelAccess);

  router.get('/', requirePermission('view:age-groups'), (req, res) => listGroups(db, req as AuthRequest, res));
  router.get('/:id/images', requirePermission('view:age-groups'), (req, res) => listImages(db, req as AuthRequest, res));
  router.post('/:id/images', requirePermission('edit:age-groups'), handleUpload, (req, res) => uploadImage(db, req as AuthRequest, res));
  router.post('/:id/images/reorder', requirePermission('edit:age-groups'), (req, res) => reorder(db, req as AuthRequest, res));
  router.delete('/:id/images/:imageId', requirePermission('edit:age-groups'), (req, res) => removeImage(db, req as AuthRequest, res));

  return router;
}
