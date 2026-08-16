import express from 'express';
import type { Response } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { authenticate, createResolveAdmin, requireAdmin } from '../../middleware/auth.js';
import { createResolvePermissions, requirePermission, requirePanelAccess } from '../../middleware/permissions.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { logActivity } from '../../utils/activityLog.js';
import { registerFacilityRoutes } from './facilities.js';
import multer from 'multer';
import * as eventExtras from '../../controllers/eventExtrasController.js';

// ---------- Schemas ----------

/** '' from an untouched form field means "not set", not a value to store. */
const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);
const optionalText = (max: number) =>
  z.preprocess(blankToNull, z.string().trim().max(max).nullable().optional());

/**
 * Matches news_events as it actually exists: description/event_date/event_type,
 * not the slug/content/published_at shape of migration 001. The previous schema
 * here described columns the table does not have, so every create and update
 * failed with `column "slug" does not exist`.
 */
const NewsEventSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(255),
  description: z.string().trim().min(10, 'Description must be at least 10 characters'),
  // Any date is allowed: this list holds past events (the site's "News"
  // section) as well as upcoming ones.
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  event_time: z.preprocess(
    blankToNull,
    z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Time must be HH:MM').nullable().optional()
  ),
  end_time: z.preprocess(
    blankToNull,
    z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Time must be HH:MM').nullable().optional()
  ),
  location: optionalText(255),
  image_url: z.preprocess(blankToNull, z.string().url('Must be a valid URL').max(500).nullable().optional()),
  event_type: optionalText(40),
  age_groups: optionalText(255),
  is_published: z.boolean().optional(),
  capacity: z.preprocess((v) => (v === '' || v === null ? null : typeof v === 'string' ? Number(v) : v), z.number().int().min(0).nullable().optional()),
  sort_order: z.number().int().min(0).optional(),
  latitude: z.preprocess((v) => (v === '' || v === null ? null : typeof v === 'string' ? Number(v) : v), z.number().min(-90).max(90).nullable().optional()),
  longitude: z.preprocess((v) => (v === '' || v === null ? null : typeof v === 'string' ? Number(v) : v), z.number().min(-180).max(180).nullable().optional()),
});

const FacilitySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(255),
  description: z.string().trim().min(1, 'Description is required'),
  image_url: z.preprocess(blankToNull, z.string().url('Must be a valid URL').max(512).nullable().optional()),
  // Optional: the six facilities already in the database have no location, so
  // requiring one would make every one of them impossible to edit.
  location: optionalText(255),
  meta_title: optionalText(255),
  meta_description: z.preprocess(blankToNull, z.string().trim().nullable().optional()),
  icon: optionalText(100),
  sort_order: z.number().int().optional(),
});

/**
 * Matches age_groups as it exists: the columns are min_age_months and
 * max_age_months. The schema and every query here said min_age/max_age, so the
 * admin list returned 500 with 'column min_age does not exist' and create and
 * update failed the same way.
 */
const AgeGroupSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(255),
  description: z.preprocess(blankToNull, z.string().trim().nullable().optional()),
  min_age_months: z.number().int().min(0),
  max_age_months: z.number().int().min(1),
});

const ReorderSchema = z.object({
  ids: z.array(z.string()),
});

// ======================== NEWS / EVENTS ========================

async function listEvents(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const search = req.query.search as string | undefined;

    // ?deleted=true shows the soft-deleted rows so they can be restored.
    const showDeleted = req.query.deleted === 'true';
    const conditions: string[] = [showDeleted ? 'deleted_at IS NOT NULL' : 'deleted_at IS NULL'];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (search) {
      // Searches title/description: the old `content` column no longer exists.
      conditions.push(
        `(LOWER(title) LIKE $${paramIdx} OR LOWER(COALESCE(description,'')) LIKE $${paramIdx})`
      );
      params.push(`%${search.toLowerCase()}%`);
      paramIdx++;
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const countResult = await db.query(`SELECT COUNT(*) FROM news_events ${where}`, params);
    const total = Number(countResult.rows[0]?.count ?? 0);

    const dataResult = await db.query(
      // sort_order leads so a drag in the admin list stays where it was put;
      // without it the list would snap back to date order on the next load.
      `SELECT * FROM news_events ${where}
       ORDER BY sort_order ASC, event_date DESC NULLS LAST, created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset]
    );

    res.json({ data: dataResult.rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('listEvents failed', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
}

async function getEvent(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await db.query('SELECT * FROM news_events WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Event not found' }); return; }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('getEvent failed', error);
    res.status(500).json({ error: 'Failed to fetch event' });
  }
}

async function createEvent(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const data = NewsEventSchema.parse(req.body);
    const result = await db.query(
      `INSERT INTO news_events
         (title, description, event_date, event_time, end_time, location,
          image_url, event_type, age_groups, is_published, capacity, latitude, longitude, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [
        data.title, data.description, data.event_date,
        data.event_time ?? null, data.end_time ?? null, data.location ?? null,
        data.image_url ?? null, data.event_type ?? 'General',
        data.age_groups ?? null, data.is_published ?? true,
        data.capacity ?? null, data.latitude ?? null, data.longitude ?? null, req.userId ?? null,
      ]
    );
    await logActivity(db, req.userId, 'create', 'news_event', result.rows[0]?.id as string, { title: data.title });
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: error.issues }); return; }
    console.error('createEvent failed', error);
    res.status(500).json({ error: 'Failed to create event' });
  }
}

async function updateEvent(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const data = NewsEventSchema.partial().parse(req.body);
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    const fields = [
      'title', 'description', 'event_date', 'event_time', 'end_time',
      'location', 'image_url', 'event_type', 'age_groups', 'is_published',
      'capacity', 'sort_order', 'latitude', 'longitude',
    ] as const;
    for (const f of fields) {
      if (data[f] === undefined) continue;
      sets.push(`${f} = $${idx++}`);
      // event_type and is_published are NOT NULL in the table, so a cleared
      // field has to fall back to the column default rather than to null.
      if (f === 'event_type') params.push(data.event_type ?? 'General');
      else if (f === 'is_published') params.push(data.is_published ?? true);
      else params.push(data[f] ?? null);
    }

    // Checked before updated_at is appended, so a request that names no real
    // column is rejected instead of silently bumping the timestamp.
    if (params.length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }
    sets.push(`updated_at = CURRENT_TIMESTAMP`);

    params.push(id);
    const result = await db.query(
      `UPDATE news_events SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Event not found' }); return; }
    await logActivity(db, req.userId, 'update', 'news_event', id, data as Record<string, unknown>);
    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: error.issues }); return; }
    console.error('updateEvent failed', error);
    res.status(500).json({ error: 'Failed to update event' });
  }
}

async function deleteEvent(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const result = await db.query(
      `UPDATE news_events SET deleted_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Event not found' }); return; }
    await logActivity(db, req.userId, 'delete', 'news_event', id, {
      oldValues: result.rows[0] as Record<string, unknown>,
      req,
    });
    res.status(204).send();
  } catch (error) {
    console.error('deleteEvent failed', error);
    res.status(500).json({ error: 'Failed to delete event' });
  }
}

async function restoreEvent(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const result = await db.query(
      `UPDATE news_events SET deleted_at = NULL
       WHERE id = $1 AND deleted_at IS NOT NULL RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'No deleted event with that id' });
      return;
    }
    await logActivity(db, req.userId, 'restore', 'news_event', id, {
      newValues: result.rows[0] as Record<string, unknown>,
      req,
    });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('restoreEvent failed', error);
    res.status(500).json({ error: 'Failed to restore event' });
  }
}

// ======================== FACILITIES ========================

async function listFacilities(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    // ?deleted=true shows the soft-deleted rows so they can be restored.
    const where = req.query.deleted === 'true'
      ? 'WHERE deleted_at IS NOT NULL'
      : 'WHERE deleted_at IS NULL';

    const countResult = await db.query(`SELECT COUNT(*) FROM facilities ${where}`);
    const total = Number(countResult.rows[0]?.count ?? 0);

    const dataResult = await db.query(
      `SELECT * FROM facilities ${where} ORDER BY sort_order ASC, created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({ data: dataResult.rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('listFacilities failed', error);
    res.status(500).json({ error: 'Failed to fetch facilities' });
  }
}

async function getFacility(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await db.query('SELECT * FROM facilities WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Facility not found' }); return; }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('getFacility failed', error);
    res.status(500).json({ error: 'Failed to fetch facility' });
  }
}

async function createFacility(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const data = FacilitySchema.parse(req.body);

    // New facilities go to the end of the list.
    const next = await db.query(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM facilities WHERE deleted_at IS NULL'
    );

    const result = await db.query(
      `INSERT INTO facilities (name, description, image_url, location, meta_title, meta_description, icon, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [data.name, data.description, data.image_url ?? null, data.location ?? null,
       data.meta_title ?? null, data.meta_description ?? null, data.icon ?? null,
       data.sort_order ?? (next.rows[0] as { next: number }).next]
    );
    await logActivity(db, req.userId, 'create', 'facility', result.rows[0]?.id as string, {
      newValues: result.rows[0] as Record<string, unknown>, req,
    });
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: error.issues }); return; }
    console.error('createFacility failed', error);
    res.status(500).json({ error: 'Failed to create facility' });
  }
}

async function updateFacility(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const data = FacilitySchema.partial().parse(req.body);
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    const fields = ['name', 'description', 'image_url', 'location', 'meta_title', 'meta_description', 'icon', 'sort_order'] as const;
    for (const f of fields) {
      if (data[f] !== undefined) { sets.push(`${f} = $${idx++}`); params.push(data[f] ?? null); }
    }

    // Checked before updated_at is appended, so a request naming no real column
    // is rejected rather than silently bumping the timestamp.
    if (params.length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }
    sets.push(`updated_at = CURRENT_TIMESTAMP`);

    params.push(id);
    const result = await db.query(
      `UPDATE facilities SET ${sets.join(', ')} WHERE id = $${idx} AND deleted_at IS NULL RETURNING *`,
      params
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Facility not found' }); return; }
    await logActivity(db, req.userId, 'update', 'facility', id, data as Record<string, unknown>);
    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: error.issues }); return; }
    console.error('updateFacility failed', error);
    res.status(500).json({ error: 'Failed to update facility' });
  }
}

async function deleteFacility(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    // Soft delete, matching every other content table: this used to be a hard
    // DELETE, so a mis-click destroyed the row with nothing to restore from.
    const result = await db.query(
      `UPDATE facilities SET deleted_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Facility not found' }); return; }
    await logActivity(db, req.userId, 'delete', 'facility', id, {
      oldValues: result.rows[0] as Record<string, unknown>, req,
    });
    res.status(204).send();
  } catch (error) {
    console.error('deleteFacility failed', error);
    res.status(500).json({ error: 'Failed to delete facility' });
  }
}

async function restoreFacility(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const result = await db.query(
      `UPDATE facilities SET deleted_at = NULL
        WHERE id = $1 AND deleted_at IS NOT NULL RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'No deleted facility with that id' });
      return;
    }
    await logActivity(db, req.userId, 'restore', 'facility', id, {
      newValues: result.rows[0] as Record<string, unknown>, req,
    });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('restoreFacility failed', error);
    res.status(500).json({ error: 'Failed to restore facility' });
  }
}

async function reorderFacilities(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { ids } = ReorderSchema.parse(req.body);
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < ids.length; i++) {
        await client.query('UPDATE facilities SET sort_order = $1 WHERE id = $2', [i, ids[i]]);
      }
      await client.query('COMMIT');
    } catch (err) { await client.query('ROLLBACK'); throw err; }
    finally { client.release(); }
    await logActivity(db, req.userId, 'update', 'facility', null, { action: 'reorder', count: ids.length });
    res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: error.issues }); return; }
    console.error('reorderFacilities failed', error);
    res.status(500).json({ error: 'Failed to reorder facilities' });
  }
}

// ======================== AGE GROUPS ========================

async function listAgeGroups(db: Pool, _req: AuthRequest, res: Response): Promise<void> {
  try {
    // Retired programmes stay in the table for their foreign key but must not
    // appear in the admin list. ?deleted=true shows them for restoring.
    const where = _req.query.deleted === 'true' ? 'WHERE deleted_at IS NOT NULL' : 'WHERE deleted_at IS NULL';
    const result = await db.query(`SELECT * FROM age_groups ${where} ORDER BY sort_order ASC, min_age_months ASC`);
    res.json(result.rows);
  } catch (error) {
    console.error('listAgeGroups failed', error);
    res.status(500).json({ error: 'Failed to fetch age groups' });
  }
}

async function createAgeGroup(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const data = AgeGroupSchema.parse(req.body);
    const result = await db.query(
      'INSERT INTO age_groups (name, description, min_age_months, max_age_months) VALUES ($1, $2, $3, $4) RETURNING *',
      [data.name, data.description ?? null, data.min_age_months, data.max_age_months]
    );
    await logActivity(db, req.userId, 'create', 'age_group', String(result.rows[0]?.id), { name: data.name });
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: error.issues }); return; }
    console.error('createAgeGroup failed', error);
    res.status(500).json({ error: 'Failed to create age group' });
  }
}

async function updateAgeGroup(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const data = AgeGroupSchema.partial().parse(req.body);
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (data.name !== undefined) { sets.push(`name = $${idx++}`); params.push(data.name); }
    if (data.description !== undefined) { sets.push(`description = $${idx++}`); params.push(data.description ?? null); }
    if (data.min_age_months !== undefined) { sets.push(`min_age_months = $${idx++}`); params.push(data.min_age_months); }
    if (data.max_age_months !== undefined) { sets.push(`max_age_months = $${idx++}`); params.push(data.max_age_months); }

    if (sets.length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }

    params.push(id);
    const result = await db.query(
      `UPDATE age_groups SET ${sets.join(', ')} WHERE id = ${idx} AND deleted_at IS NULL RETURNING *`,
      params
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Age group not found' }); return; }
    await logActivity(db, req.userId, 'update', 'age_group', id);
    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: error.issues }); return; }
    console.error('updateAgeGroup failed', error);
    res.status(500).json({ error: 'Failed to update age group' });
  }
}

async function deleteAgeGroup(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    // Soft delete: registrations.age_group_id references these rows, so a hard
    // DELETE would either fail or orphan a registration.
    const result = await db.query(
      'UPDATE age_groups SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND deleted_at IS NULL RETURNING id',
      [id]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Age group not found' }); return; }
    await logActivity(db, req.userId, 'delete', 'age_group', id);
    res.status(204).send();
  } catch (error) {
    // FK constraint — age group in use by registrations
    if (typeof error === 'object' && error !== null && (error as { code?: string }).code === '23503') {
      res.status(409).json({ error: 'Cannot delete: age group is in use by existing registrations' });
      return;
    }
    console.error('deleteAgeGroup failed', error);
    res.status(500).json({ error: 'Failed to delete age group' });
  }
}

// ======================== Router ========================

/**
 * The event routes on their own, so they can be mounted at /admin/events as
 * well as under /admin/content. The admin UI uses /admin/events; the recycle
 * bin still calls /admin/content/events, so both stay live.
 */
// 10 MB, image only. memoryStorage streams the buffer straight to Cloudinary.
const eventUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype?.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

const handleEventImage: express.RequestHandler = (req, res, next) => {
  eventUpload.single('image')(req, res, (err: unknown) => {
    if (!err) { next(); return; }
    const message = err instanceof Error ? err.message : 'Upload failed';
    const tooBig = message.includes('File too large');
    res.status(400).json({ error: tooBig ? 'Image must be 10 MB or smaller' : message });
  });
};

export function createAdminEventsRouter(db: Pool): express.Router {
  const router = express.Router();
  const resolveAdmin = createResolveAdmin(db);

  router.use(authenticate, resolveAdmin, createResolvePermissions(db), requirePanelAccess);

  router.get('/', requirePermission('view:news'), (req, res) => listEvents(db, req as AuthRequest, res));
  router.get('/:id', requirePermission('view:news'), (req, res) => getEvent(db, req as AuthRequest, res));
  router.post('/', requirePermission('create:news'), (req, res) => createEvent(db, req as AuthRequest, res));
  router.put('/:id', requirePermission('edit:news'), (req, res) => updateEvent(db, req as AuthRequest, res));
  router.delete('/:id', requirePermission('delete:news'), (req, res) => deleteEvent(db, req as AuthRequest, res));
  router.post('/:id/restore', requirePermission('edit:news'), (req, res) => restoreEvent(db, req as AuthRequest, res));
  router.post('/reorder', requirePermission('edit:news'), (req, res) => eventExtras.reorderEvents(db, req as AuthRequest, res));
  router.post('/:id/image', requirePermission('edit:news'), handleEventImage, (req, res) => eventExtras.uploadEventImage(db, req as AuthRequest, res));
  router.delete('/:id/image', requirePermission('delete:news'), (req, res) => eventExtras.deleteEventImage(db, req as AuthRequest, res));

  return router;
}

export function createAdminContentRouter(db: Pool): express.Router {
  const router = express.Router();
  const resolveAdmin = createResolveAdmin(db);

  router.use(authenticate, resolveAdmin, createResolvePermissions(db), requirePanelAccess);

  // News/Events
  router.get('/events', requirePermission('view:news'), (req, res) => listEvents(db, req as AuthRequest, res));
  router.get('/events/:id', requirePermission('view:news'), (req, res) => getEvent(db, req as AuthRequest, res));
  router.post('/events', requirePermission('edit:news'), (req, res) => createEvent(db, req as AuthRequest, res));
  router.put('/events/:id', requirePermission('edit:news'), (req, res) => updateEvent(db, req as AuthRequest, res));
  router.delete('/events/:id', requirePermission('delete:news'), (req, res) => deleteEvent(db, req as AuthRequest, res));
  router.post('/events/:id/restore', requirePermission('edit:news'), (req, res) => restoreEvent(db, req as AuthRequest, res));

  // Facilities: same controller as /admin/facilities, so the two cannot drift.
  registerFacilityRoutes(router, db, '/facilities');

  // Age Groups
  router.get('/age-groups', requirePermission('view:age-groups'), (req, res) => listAgeGroups(db, req as AuthRequest, res));
  router.post('/age-groups', requirePermission('edit:age-groups'), (req, res) => createAgeGroup(db, req as AuthRequest, res));
  router.put('/age-groups/:id', requirePermission('edit:age-groups'), (req, res) => updateAgeGroup(db, req as AuthRequest, res));
  router.delete('/age-groups/:id', requirePermission('edit:age-groups'), (req, res) => deleteAgeGroup(db, req as AuthRequest, res));

  return router;
}
