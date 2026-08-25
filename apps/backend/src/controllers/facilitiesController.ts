import type { Response } from 'express';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { cloudinary, isCloudinaryConfigured } from '../config/cloudinary.js';
import type { AuthRequest } from '../middleware/auth.js';
import { logActivity } from '../utils/activityLog.js';

/**
 * Facilities, with their bullet lists and photographs.
 *
 * One controller for both mount points (/admin/facilities and the older
 * /admin/content/facilities) so the two cannot drift apart.
 */

const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);
const optionalText = (max: number) =>
  z.preprocess(blankToNull, z.string().trim().max(max).nullable().optional());

const FeatureList = z.array(z.string().trim().min(1).max(255)).max(30).optional();

const FacilitySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(255),
  description: z.string().trim().min(1, 'Description is required'),
  detailed_description: z.preprocess(blankToNull, z.string().trim().nullable().optional()),
  icon: optionalText(100),
  location: optionalText(255),
  image_url: z.preprocess(blankToNull, z.string().url('Must be a valid URL').max(512).nullable().optional()),
  meta_title: optionalText(255),
  meta_description: z.preprocess(blankToNull, z.string().trim().nullable().optional()),
  sort_order: z.number().int().optional(),
  /** Card bullets. */
  features: FeatureList,
  /** Modal bullets. */
  amenities: FeatureList,
});

/** Rewrites one bullet list for a facility, preserving the order given. */
async function replaceFeatures(
  client: PoolClient,
  facilityId: string,
  type: 'feature' | 'amenity',
  values: string[]
): Promise<void> {
  await client.query('DELETE FROM facility_features WHERE facility_id = $1 AND feature_type = $2', [facilityId, type]);
  if (values.length === 0) return;
  await client.query(
    `INSERT INTO facility_features (facility_id, feature_text, feature_type, display_order)
     SELECT $1, v.text, $2, v.ord
       FROM (SELECT unnest($3::text[]) AS text, generate_subscripts($3::text[], 1) - 1 AS ord) AS v
     ON CONFLICT (facility_id, feature_type, lower(feature_text)) DO NOTHING`,
    [facilityId, type, values]
  );
}

/** Attaches features, amenities and images to a set of facility rows. */
async function decorate(db: Pool, rows: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  if (rows.length === 0) return rows;
  const ids = rows.map((r) => r.id as string);

  const [features, images] = await Promise.all([
    db.query(
      `SELECT facility_id, feature_text, feature_type
         FROM facility_features WHERE facility_id = ANY($1::uuid[])
        ORDER BY display_order ASC, id ASC`,
      [ids]
    ),
    db.query(
      `SELECT fi.facility_id, fi.id AS assignment_id, fi.is_primary, fi.display_order,
              m.id AS media_id, m.url, m.alt_text, m.title
         FROM facility_images fi
         JOIN media m ON m.id = fi.media_id AND m.deleted_at IS NULL
        WHERE fi.facility_id = ANY($1::uuid[]) AND fi.deleted_at IS NULL
        ORDER BY fi.is_primary DESC, fi.display_order ASC`,
      [ids]
    ),
  ]);

  const byId = new Map(rows.map((r) => [r.id as string, r]));
  for (const row of rows) {
    row.features = [];
    row.amenities = [];
    row.images = [];
  }
  for (const f of features.rows as { facility_id: string; feature_text: string; feature_type: string }[]) {
    const target = byId.get(f.facility_id);
    if (!target) continue;
    (target[f.feature_type === 'amenity' ? 'amenities' : 'features'] as string[]).push(f.feature_text);
  }
  for (const img of images.rows as Record<string, unknown>[]) {
    const target = byId.get(img.facility_id as string);
    if (target) (target.images as unknown[]).push(img);
  }
  return rows;
}

// -------------------------------------------------------------------- admin

export async function listFacilities(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const offset = (page - 1) * limit;
    const where = req.query.deleted === 'true' ? 'WHERE deleted_at IS NOT NULL' : 'WHERE deleted_at IS NULL';

    const [count, rows] = await Promise.all([
      db.query(`SELECT COUNT(*) FROM facilities ${where}`),
      db.query(
        `SELECT * FROM facilities ${where} ORDER BY sort_order ASC, created_at DESC LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
    ]);

    const total = Number((count.rows[0] as { count?: string })?.count ?? 0);
    res.json({
      data: await decorate(db, rows.rows as Record<string, unknown>[]),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('listFacilities failed', error);
    res.status(500).json({ error: 'Failed to fetch facilities' });
  }
}

export async function getFacility(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await db.query('SELECT * FROM facilities WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Facility not found' }); return; }
    const [row] = await decorate(db, result.rows as Record<string, unknown>[]);
    res.json(row);
  } catch (error) {
    console.error('getFacility failed', error);
    res.status(500).json({ error: 'Failed to fetch facility' });
  }
}

export async function createFacility(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  const client = await db.connect();
  try {
    const data = FacilitySchema.parse(req.body);
    await client.query('BEGIN');

    const next = await client.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM facilities WHERE deleted_at IS NULL'
    );
    const result = await client.query(
      `INSERT INTO facilities (name, description, detailed_description, icon, location, image_url, meta_title, meta_description, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        data.name, data.description, data.detailed_description ?? null, data.icon ?? null,
        data.location ?? null, data.image_url ?? null, data.meta_title ?? null,
        data.meta_description ?? null, data.sort_order ?? (next.rows[0] as { next: number }).next,
      ]
    );
    const facility = result.rows[0] as { id: string };

    await replaceFeatures(client, facility.id, 'feature', data.features ?? []);
    await replaceFeatures(client, facility.id, 'amenity', data.amenities ?? []);
    await client.query('COMMIT');

    await logActivity(db, req.userId, 'create', 'facility', facility.id, {
      newValues: result.rows[0] as Record<string, unknown>, req,
    });
    const [row] = await decorate(db, result.rows as Record<string, unknown>[]);
    res.status(201).json(row);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
      return;
    }
    // The partial unique index on lower(name) is what rejects a duplicate.
    if ((error as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'A facility with that name already exists' });
      return;
    }
    console.error('createFacility failed', error);
    res.status(500).json({ error: 'Failed to create facility' });
  } finally { client.release(); }
}

export async function updateFacility(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  const client = await db.connect();
  try {
    const { id } = req.params;
    const data = FacilitySchema.partial().parse(req.body);
    await client.query('BEGIN');

    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    const columns = [
      'name', 'description', 'detailed_description', 'icon', 'location',
      'image_url', 'meta_title', 'meta_description', 'sort_order',
    ] as const;
    for (const column of columns) {
      if (data[column] === undefined) continue;
      sets.push(`${column} = $${idx++}`);
      params.push(data[column] ?? null);
    }

    let row: Record<string, unknown> | undefined;
    if (sets.length > 0) {
      sets.push('updated_at = CURRENT_TIMESTAMP');
      params.push(id);
      const result = await client.query(
        `UPDATE facilities SET ${sets.join(', ')} WHERE id = $${idx} AND deleted_at IS NULL RETURNING *`,
        params
      );
      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ error: 'Facility not found' });
        return;
      }
      row = result.rows[0] as Record<string, unknown>;
    } else {
      const existing = await client.query('SELECT * FROM facilities WHERE id = $1 AND deleted_at IS NULL', [id]);
      if (existing.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ error: 'Facility not found' });
        return;
      }
      row = existing.rows[0] as Record<string, unknown>;
    }

    // Only rewritten when the caller sends the list, so a partial update that
    // omits them leaves the bullets alone rather than clearing them.
    if (data.features !== undefined) await replaceFeatures(client, id as string, 'feature', data.features);
    if (data.amenities !== undefined) await replaceFeatures(client, id as string, 'amenity', data.amenities);

    await client.query('COMMIT');
    await logActivity(db, req.userId, 'update', 'facility', id as string, { newValues: row, req });
    const [decorated] = await decorate(db, [row]);
    res.json(decorated);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
      return;
    }
    if ((error as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'A facility with that name already exists' });
      return;
    }
    console.error('updateFacility failed', error);
    res.status(500).json({ error: 'Failed to update facility' });
  } finally { client.release(); }
}

export async function deleteFacility(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const result = await db.query(
      `UPDATE facilities SET deleted_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Facility not found' }); return; }
    await logActivity(db, req.userId, 'delete', 'facility', id as string, {
      oldValues: result.rows[0] as Record<string, unknown>, req,
    });
    res.status(204).send();
  } catch (error) {
    console.error('deleteFacility failed', error);
    res.status(500).json({ error: 'Failed to delete facility' });
  }
}

export async function restoreFacility(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await db.query(
      `UPDATE facilities SET deleted_at = NULL
        WHERE id = $1 AND deleted_at IS NOT NULL RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'No deleted facility with that id' }); return; }
    await logActivity(db, req.userId, 'restore', 'facility', req.params.id as string, {
      newValues: result.rows[0] as Record<string, unknown>, req,
    });
    res.json(result.rows[0]);
  } catch (error) {
    // Restoring onto a name that has since been reused hits the unique index.
    if ((error as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'Another facility now uses that name. Rename it first.' });
      return;
    }
    console.error('restoreFacility failed', error);
    res.status(500).json({ error: 'Failed to restore facility' });
  }
}

const ReorderSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) });

export async function reorderFacilities(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { ids } = ReorderSchema.parse(req.body);
    await db.query(
      `UPDATE facilities AS f
          SET sort_order = v.ord, updated_at = CURRENT_TIMESTAMP
         FROM (SELECT unnest($1::uuid[]) AS id, generate_subscripts($1::uuid[], 1) AS ord) AS v
        WHERE f.id = v.id AND f.deleted_at IS NULL`,
      [ids]
    );
    res.json({ reordered: ids.length });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
      return;
    }
    console.error('reorderFacilities failed', error);
    res.status(500).json({ error: 'Failed to reorder facilities' });
  }
}

// ------------------------------------------------------------------- images

export async function uploadFacilityImage(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const exists = await db.query('SELECT id, name FROM facilities WHERE id = $1 AND deleted_at IS NULL', [id]);
    if (exists.rows.length === 0) { res.status(404).json({ error: 'Facility not found' }); return; }

    if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }
    if (!isCloudinaryConfigured()) {
      res.status(503).json({ error: 'Image hosting is not configured. Set CLOUDINARY_URL.' });
      return;
    }

    const uploaded = await new Promise<{ secure_url: string; public_id: string; asset_id?: string; width?: number; height?: number; bytes?: number }>(
      (resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: 'bayrotna/facilities',
            resource_type: 'image',
            tags: ['media', 'facilities'],
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
    const body = req.body as Record<string, string | undefined>;
    const facilityName = (exists.rows[0] as { name: string }).name;
    const alt = (body?.alt_text || '').trim() || facilityName;

    const media = await db.query(
      `INSERT INTO media
         (title, url, cloudinary_id, cloudinary_public_id, file_size, mime_type,
          width, height, alt_text, category, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pages',$10) RETURNING id`,
      [
        facilityName, url, uploaded.asset_id ?? null, uploaded.public_id,
        uploaded.bytes ?? req.file.size ?? null, req.file.mimetype,
        uploaded.width ?? null, uploaded.height ?? null, alt, req.userId ?? null,
      ]
    );
    const mediaId = (media.rows[0] as { id: string }).id;

    // The newest upload becomes the facility's primary image.
    //
    // It used to be only the first, which read as a broken upload: the list is
    // ordered is_primary DESC, so a second, better photo landed behind the
    // original and the card carried on showing the old one.
    //
    // Insert and demote together, or a failure between them leaves the
    // facility with two primaries or none.
    const client = await db.connect();
    let assignment;
    try {
      await client.query('BEGIN');

      const next = await client.query(
        `SELECT COALESCE(MAX(display_order), -1) + 1 AS next FROM facility_images
          WHERE facility_id = $1 AND deleted_at IS NULL`,
        [id]
      );

      assignment = await client.query(
        `INSERT INTO facility_images (facility_id, media_id, is_primary, display_order)
         VALUES ($1,$2,TRUE,$3) RETURNING *`,
        [id, mediaId, (next.rows[0] as { next: number }).next]
      );

      await client.query(
        `UPDATE facility_images SET is_primary = FALSE
          WHERE facility_id = $1 AND id <> $2 AND deleted_at IS NULL`,
        [id, assignment.rows[0]?.id]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    await logActivity(db, req.userId, 'upload', 'facility_image', assignment.rows[0]?.id as string, {
      newValues: { facility_id: id, media_id: mediaId }, req,
    });

    res.status(201).json({
      assignment_id: assignment.rows[0]?.id,
      media_id: mediaId,
      url,
      alt_text: alt,
      is_primary: true,
    });
  } catch (error) {
    console.error('uploadFacilityImage failed', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
}

export async function deleteFacilityImage(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await db.query(
      `UPDATE facility_images SET deleted_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND facility_id = $2 AND deleted_at IS NULL RETURNING *`,
      [req.params.imageId, req.params.id]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Image not found for this facility' }); return; }

    // If the primary was removed, promote whatever is now first so the facility
    // is never left without one.
    if ((result.rows[0] as { is_primary?: boolean }).is_primary) {
      await db.query(
        `UPDATE facility_images SET is_primary = TRUE
          WHERE id = (
            SELECT id FROM facility_images
             WHERE facility_id = $1 AND deleted_at IS NULL
             ORDER BY display_order ASC LIMIT 1
          )`,
        [req.params.id]
      );
    }

    await logActivity(db, req.userId, 'delete', 'facility_image', req.params.imageId as string, {
      oldValues: result.rows[0] as Record<string, unknown>, req,
    });
    res.status(204).send();
  } catch (error) {
    console.error('deleteFacilityImage failed', error);
    res.status(500).json({ error: 'Failed to remove image' });
  }
}

// ------------------------------------------------------------------- public

export async function listPublicFacilities(db: Pool, _req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await db.query(
      'SELECT * FROM facilities WHERE deleted_at IS NULL ORDER BY sort_order ASC, created_at ASC'
    );
    res.json(await decorate(db, result.rows as Record<string, unknown>[]));
  } catch (error) {
    console.error('listPublicFacilities failed', error);
    // The page falls back to its built-in list, so an empty array is safe.
    res.json([]);
  }
}
