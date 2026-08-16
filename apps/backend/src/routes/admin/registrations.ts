import express from 'express';
import type { Response } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { authenticate, createResolveAdmin, requireAdmin } from '../../middleware/auth.js';
import { createResolvePermissions, requirePermission, requirePanelAccess } from '../../middleware/permissions.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { logActivity } from '../../utils/activityLog.js';

const StatusSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']),
  notes: z.string().optional(),
});

async function listRegistrations(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const status = req.query.status as string | undefined;
    const search = req.query.search as string | undefined;
    const sortBy = req.query.sortBy as string || 'created_at';
    const sortDir = req.query.sortDir === 'asc' ? 'ASC' : 'DESC';

    const allowedSorts = ['created_at', 'first_name', 'last_name', 'email', 'status'];
    const safeSort = allowedSorts.includes(sortBy) ? sortBy : 'created_at';

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      conditions.push(`r.status = $${paramIdx++}`);
      params.push(status);
    }

    if (search) {
      conditions.push(
        `(LOWER(r.first_name) LIKE $${paramIdx} OR LOWER(r.last_name) LIKE $${paramIdx} OR LOWER(r.email) LIKE $${paramIdx})`
      );
      params.push(`%${search.toLowerCase()}%`);
      paramIdx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await db.query(
      `SELECT COUNT(*) FROM registrations r ${where}`,
      params
    );
    const total = Number(countResult.rows[0]?.count ?? 0);

    const dataResult = await db.query(
      `SELECT r.*, ag.name as age_group_name
       FROM registrations r
       LEFT JOIN age_groups ag ON r.age_group_id = ag.id
       ${where}
       ORDER BY r.${safeSort} ${sortDir}
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset]
    );

    res.json({
      data: dataResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('listRegistrations failed', error);
    res.status(500).json({ error: 'Failed to fetch registrations' });
  }
}

async function getRegistration(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const result = await db.query(
      `SELECT r.*, ag.name as age_group_name
       FROM registrations r
       LEFT JOIN age_groups ag ON r.age_group_id = ag.id
       WHERE r.id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Registration not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('getRegistration failed', error);
    res.status(500).json({ error: 'Failed to fetch registration' });
  }
}

async function updateRegistrationStatus(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const data = StatusSchema.parse(req.body);

    const result = await db.query(
      `UPDATE registrations SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
      [data.status, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Registration not found' });
      return;
    }

    await logActivity(db, req.userId, 'status_change', 'registration', id, {
      newStatus: data.status,
      notes: data.notes,
    });

    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
      return;
    }
    console.error('updateRegistrationStatus failed', error);
    res.status(500).json({ error: 'Failed to update registration status' });
  }
}

async function deleteRegistration(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const result = await db.query('DELETE FROM registrations WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Registration not found' });
      return;
    }
    await logActivity(db, req.userId, 'delete', 'registration', id);
    res.status(204).send();
  } catch (error) {
    console.error('deleteRegistration failed', error);
    res.status(500).json({ error: 'Failed to delete registration' });
  }
}

async function exportRegistrations(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const status = req.query.status as string | undefined;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      conditions.push('r.status = $1');
      params.push(status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await db.query(
      `SELECT r.first_name, r.last_name, r.email, r.phone, r.status, ag.name as age_group, r.created_at
       FROM registrations r
       LEFT JOIN age_groups ag ON r.age_group_id = ag.id
       ${where}
       ORDER BY r.created_at DESC`,
      params
    );

    const header = 'First Name,Last Name,Email,Phone,Status,Age Group,Date\n';
    const csv = result.rows.map((r: Record<string, unknown>) =>
      `"${r.first_name}","${r.last_name}","${r.email}","${r.phone}","${r.status}","${r.age_group || ''}","${r.created_at}"`
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=registrations.csv');
    res.send(header + csv);
  } catch (error) {
    console.error('exportRegistrations failed', error);
    res.status(500).json({ error: 'Failed to export registrations' });
  }
}

export function createAdminRegistrationsRouter(db: Pool): express.Router {
  const router = express.Router();
  const resolveAdmin = createResolveAdmin(db);

  router.use(authenticate, resolveAdmin, createResolvePermissions(db), requirePanelAccess);

  router.get('/', requirePermission('view:registrations'), (req, res) => listRegistrations(db, req as AuthRequest, res));
  router.get('/export', requirePermission('view:registrations'), (req, res) => exportRegistrations(db, req as AuthRequest, res));
  router.get('/:id', requirePermission('view:registrations'), (req, res) => getRegistration(db, req as AuthRequest, res));
  router.patch('/:id/status', requirePermission('edit:registrations'), (req, res) => updateRegistrationStatus(db, req as AuthRequest, res));
  router.delete('/:id', requirePermission('delete:registrations'), (req, res) => deleteRegistration(db, req as AuthRequest, res));

  return router;
}
