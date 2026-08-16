import express from 'express';
import type { Response } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { authenticate, createResolveAdmin, requireAdmin } from '../../middleware/auth.js';
import { createResolvePermissions, requirePermission, requirePanelAccess } from '../../middleware/permissions.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { logActivity } from '../../utils/activityLog.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// ---------- Multer config ----------
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads/gallery';

// Ensure directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req: any, _file: any, cb: any) => cb(null, UPLOAD_DIR),
  filename: (_req: any, file: any, cb: any) => {
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req: any, file: any, cb: any) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|svg|avif)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// ---------- Schemas ----------
const CategorySchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(255),
  description: z.string().optional(),
});

const ImageSchema = z.object({
  category_id: z.string().uuid(),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
});

const ReorderSchema = z.object({
  ids: z.array(z.string().uuid()),
});

// ---------- Categories ----------
async function listCategories(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const showDeleted = req.query.deleted === 'true';
    const result = await db.query(
      `SELECT gc.*, COUNT(gi.id)::int as image_count
       FROM gallery_categories gc
       LEFT JOIN gallery_images gi ON gi.category_id = gc.id AND gi.deleted_at IS NULL
       WHERE gc.deleted_at IS ${showDeleted ? 'NOT NULL' : 'NULL'}
       GROUP BY gc.id
       ORDER BY gc.sort_order ASC, gc.created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('listCategories failed', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
}

async function createCategory(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const data = CategorySchema.parse(req.body);
    const result = await db.query(
      `INSERT INTO gallery_categories (name, slug, description)
       VALUES ($1, $2, $3) RETURNING *`,
      [data.name, data.slug, data.description || null]
    );
    await logActivity(db, req.userId, 'create', 'gallery_category', result.rows[0]?.id as string, { name: data.name });
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
      return;
    }
    console.error('createCategory failed', error);
    res.status(500).json({ error: 'Failed to create category' });
  }
}

async function updateCategory(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const data = CategorySchema.partial().parse(req.body);
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (data.name !== undefined) { sets.push(`name = $${idx++}`); params.push(data.name); }
    if (data.slug !== undefined) { sets.push(`slug = $${idx++}`); params.push(data.slug); }
    if (data.description !== undefined) { sets.push(`description = $${idx++}`); params.push(data.description); }

    if (sets.length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }

    params.push(id);
    const result = await db.query(
      `UPDATE gallery_categories SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Category not found' }); return; }
    await logActivity(db, req.userId, 'update', 'gallery_category', id, data as Record<string, unknown>);
    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
      return;
    }
    console.error('updateCategory failed', error);
    res.status(500).json({ error: 'Failed to update category' });
  }
}

async function deleteCategory(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const result = await db.query(
      `UPDATE gallery_categories SET deleted_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Category not found' }); return; }

    // Images in a removed category would otherwise be orphaned on the public
    // page, so they go with it and come back together on restore.
    await db.query(
      `UPDATE gallery_images SET deleted_at = CURRENT_TIMESTAMP
       WHERE category_id = $1 AND deleted_at IS NULL`,
      [id]
    );

    await logActivity(db, req.userId, 'delete', 'gallery_category', id, {
      oldValues: result.rows[0] as Record<string, unknown>,
      req,
    });
    res.status(204).send();
  } catch (error) {
    console.error('deleteCategory failed', error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
}

async function restoreCategory(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const result = await db.query(
      `UPDATE gallery_categories SET deleted_at = NULL
       WHERE id = $1 AND deleted_at IS NOT NULL RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'No deleted category with that id' });
      return;
    }
    await db.query(
      'UPDATE gallery_images SET deleted_at = NULL WHERE category_id = $1',
      [id]
    );
    await logActivity(db, req.userId, 'restore', 'gallery_category', id, {
      newValues: result.rows[0] as Record<string, unknown>,
      req,
    });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('restoreCategory failed', error);
    res.status(500).json({ error: 'Failed to restore category' });
  }
}

/** Everything currently in the recycle bin, for the restore view. */
async function listDeleted(db: Pool, _req: AuthRequest, res: Response): Promise<void> {
  try {
    const images = await db.query(
      `SELECT gi.*, gc.name AS category_name
       FROM gallery_images gi
       LEFT JOIN gallery_categories gc ON gi.category_id = gc.id
       WHERE gi.deleted_at IS NOT NULL
       ORDER BY gi.deleted_at DESC LIMIT 200`
    );
    const categories = await db.query(
      `SELECT * FROM gallery_categories WHERE deleted_at IS NOT NULL
       ORDER BY deleted_at DESC LIMIT 200`
    );
    res.json({ images: images.rows, categories: categories.rows });
  } catch (error) {
    console.error('listDeleted failed', error);
    res.status(500).json({ error: 'Failed to fetch deleted items' });
  }
}

async function restoreImage(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const result = await db.query(
      `UPDATE gallery_images SET deleted_at = NULL
       WHERE id = $1 AND deleted_at IS NOT NULL RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'No deleted image with that id' });
      return;
    }
    await logActivity(db, req.userId, 'restore', 'gallery_image', id, {
      newValues: result.rows[0] as Record<string, unknown>,
      req,
    });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('restoreImage failed', error);
    res.status(500).json({ error: 'Failed to restore image' });
  }
}

async function reorderCategories(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { ids } = ReorderSchema.parse(req.body);
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < ids.length; i++) {
        await client.query('UPDATE gallery_categories SET sort_order = $1 WHERE id = $2', [i, ids[i]]);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    await logActivity(db, req.userId, 'update', 'gallery_category', null, { action: 'reorder', count: ids.length });
    res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
      return;
    }
    console.error('reorderCategories failed', error);
    res.status(500).json({ error: 'Failed to reorder categories' });
  }
}

// ---------- Images ----------
async function listImages(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
    const offset = (page - 1) * limit;
    const categoryId = req.query.categoryId as string | undefined;

    const conditions: string[] = ['gi.deleted_at IS NULL'];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (categoryId) {
      conditions.push(`gi.category_id = $${paramIdx++}`);
      params.push(categoryId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await db.query(
      `SELECT COUNT(*) FROM gallery_images gi ${where}`,
      params
    );
    const total = Number(countResult.rows[0]?.count ?? 0);

    const dataResult = await db.query(
      `SELECT gi.*, gc.name as category_name
       FROM gallery_images gi
       LEFT JOIN gallery_categories gc ON gi.category_id = gc.id
       ${where}
       ORDER BY gi.sort_order ASC, gi.created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset]
    );

    res.json({
      data: dataResult.rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('listImages failed', error);
    res.status(500).json({ error: 'Failed to fetch images' });
  }
}

async function uploadImage(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No image file provided' });
      return;
    }

    const data = ImageSchema.parse(req.body);
    const imageUrl = `/uploads/gallery/${req.file.filename}`;

    const result = await db.query(
      `INSERT INTO gallery_images (category_id, image_url, title, description)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [data.category_id, imageUrl, data.title, data.description || null]
    );

    await logActivity(db, req.userId, 'upload', 'gallery_image', result.rows[0]?.id as string, {
      title: data.title,
      filename: req.file.filename,
    });

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
      return;
    }
    console.error('uploadImage failed', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
}

async function updateImage(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const body = req.body as Record<string, unknown>;
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (typeof body.title === 'string') { sets.push(`title = $${idx++}`); params.push(body.title); }
    if (typeof body.description === 'string') { sets.push(`description = $${idx++}`); params.push(body.description); }
    if (typeof body.category_id === 'string') { sets.push(`category_id = $${idx++}`); params.push(body.category_id); }

    if (sets.length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }

    params.push(id);
    const result = await db.query(
      `UPDATE gallery_images SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Image not found' }); return; }
    await logActivity(db, req.userId, 'update', 'gallery_image', id);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('updateImage failed', error);
    res.status(500).json({ error: 'Failed to update image' });
  }
}

async function deleteImage(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    // Soft delete: the uploaded file is deliberately left on disk. Unlinking it
    // here would make a restore produce a row pointing at a missing image.
    const result = await db.query(
      `UPDATE gallery_images SET deleted_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Image not found' }); return; }

    await logActivity(db, req.userId, 'delete', 'gallery_image', id, {
      oldValues: result.rows[0] as Record<string, unknown>,
      req,
    });
    res.status(204).send();
  } catch (error) {
    console.error('deleteImage failed', error);
    res.status(500).json({ error: 'Failed to delete image' });
  }
}

async function reorderImages(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { ids } = ReorderSchema.parse(req.body);
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < ids.length; i++) {
        await client.query('UPDATE gallery_images SET sort_order = $1 WHERE id = $2', [i, ids[i]]);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    await logActivity(db, req.userId, 'update', 'gallery_image', null, { action: 'reorder', count: ids.length });
    res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
      return;
    }
    console.error('reorderImages failed', error);
    res.status(500).json({ error: 'Failed to reorder images' });
  }
}

// ---------- Bulk upload ----------
async function bulkUpload(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const files = req.files as any;
    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No files provided' });
      return;
    }

    const categoryId = req.body.category_id as string;
    if (!categoryId) {
      res.status(400).json({ error: 'category_id is required' });
      return;
    }

    const results = [];
    for (const file of files) {
      const imageUrl = `/uploads/gallery/${file.filename}`;
      const title = path.parse(file.originalname).name;
      const result = await db.query(
        `INSERT INTO gallery_images (category_id, image_url, title)
         VALUES ($1, $2, $3) RETURNING *`,
        [categoryId, imageUrl, title]
      );
      results.push(result.rows[0]);
    }

    await logActivity(db, req.userId, 'upload', 'gallery_image', null, {
      action: 'bulk_upload',
      count: files.length,
    });

    res.status(201).json(results);
  } catch (error) {
    console.error('bulkUpload failed', error);
    res.status(500).json({ error: 'Failed to upload images' });
  }
}

export function createAdminGalleryRouter(db: Pool): express.Router {
  const router = express.Router();
  const resolveAdmin = createResolveAdmin(db);

  router.use(authenticate, resolveAdmin, createResolvePermissions(db), requirePanelAccess);

  // Categories
  router.get('/categories', requirePermission('view:gallery'), (req, res) => listCategories(db, req as AuthRequest, res));
  router.get('/deleted', requirePermission('view:gallery'), (req, res) => listDeleted(db, req as AuthRequest, res));
  router.post('/categories', requirePermission('manage:gallery'), (req, res) => createCategory(db, req as AuthRequest, res));
  router.put('/categories/:id', requirePermission('manage:gallery'), (req, res) => updateCategory(db, req as AuthRequest, res));
  router.delete('/categories/:id', requirePermission('manage:gallery'), (req, res) => deleteCategory(db, req as AuthRequest, res));
  router.post('/categories/:id/restore', requirePermission('manage:gallery'), (req, res) => restoreCategory(db, req as AuthRequest, res));
  router.post('/categories/reorder', requirePermission('manage:gallery'), (req, res) => reorderCategories(db, req as AuthRequest, res));

  // Images
  router.get('/images', requirePermission('view:gallery'), (req, res) => listImages(db, req as AuthRequest, res));
  router.post('/images', requirePermission('manage:gallery'), upload.single('image'), (req, res) => uploadImage(db, req as AuthRequest, res));
  router.put('/images/:id', requirePermission('manage:gallery'), (req, res) => updateImage(db, req as AuthRequest, res));
  router.delete('/images/:id', requirePermission('manage:gallery'), (req, res) => deleteImage(db, req as AuthRequest, res));
  router.post('/images/:id/restore', requirePermission('manage:gallery'), (req, res) => restoreImage(db, req as AuthRequest, res));
  router.post('/images/reorder', requirePermission('manage:gallery'), (req, res) => reorderImages(db, req as AuthRequest, res));
  router.post('/images/bulk', requirePermission('manage:gallery'), upload.array('images', 20), (req, res) => bulkUpload(db, req as AuthRequest, res));

  return router;
}
