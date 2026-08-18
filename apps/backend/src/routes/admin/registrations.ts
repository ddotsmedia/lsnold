import express from 'express';
import type { Response } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { authenticate, createResolveAdmin, requireAdmin } from '../../middleware/auth.js';
import { createResolvePermissions, requirePermission, requirePanelAccess } from '../../middleware/permissions.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { sendTabular, type Column } from '../../utils/tabular.js';
import { logActivity } from '../../utils/activityLog.js';
import { emitToRoom } from '../../realtime.js';
import { bulkStatus, bulkDelete, type BulkTarget } from '../../utils/bulk.js';

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
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const sortBy = req.query.sortBy as string || 'created_at';
    const sortDir = req.query.sortDir === 'asc' ? 'ASC' : 'DESC';

    // Same schema drift as the export had: this table has child_name and
    // parent_name, never first_name/last_name. Sorting or searching by the old
    // names raised "column does not exist" rather than returning nothing.
    const allowedSorts = ['created_at', 'child_name', 'parent_name', 'parent_email', 'status'];
    const safeSort = allowedSorts.includes(sortBy) ? sortBy : 'created_at';

    const conditions: string[] = ['r.deleted_at IS NULL'];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      conditions.push(`r.status = $${paramIdx++}`);
      params.push(status);
    }

    if (search) {
      conditions.push(
        `(LOWER(r.child_name) LIKE $${paramIdx} OR LOWER(r.parent_name) LIKE $${paramIdx}`
        + ` OR LOWER(r.parent_email) LIKE $${paramIdx})`
      );
      params.push(`%${search.toLowerCase()}%`);
      paramIdx++;
    }

    // Inclusive of the whole end day: a range of 1st to 1st should return that
    // day's registrations, not none.
    if (dateFrom) {
      conditions.push(`r.created_at >= ${paramIdx++}::date`);
      params.push(dateFrom);
    }
    if (dateTo) {
      conditions.push(`r.created_at < (${paramIdx++}::date + INTERVAL '1 day')`);
      params.push(dateTo);
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
       WHERE r.id = $1 AND r.deleted_at IS NULL`,
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
      `UPDATE registrations SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND deleted_at IS NULL RETURNING *`,
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

    emitToRoom('registrations', 'registration:updated', result.rows[0]);

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
    // Soft: these rows carry a family's contact details, and a misclick on
    // the wrong one should not be unrecoverable.
    const result = await db.query(
      'UPDATE registrations SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id',
      [id]
    );
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

const REGISTRATION_COLUMNS: Column[] = [
  { key: 'child_name', header: 'Child' },
  { key: 'child_dob', header: 'Date of birth', type: 'date' },
  { key: 'age_group', header: 'Age group' },
  { key: 'parent_name', header: 'Parent' },
  { key: 'parent_email', header: 'Email' },
  { key: 'parent_phone', header: 'Phone' },
  { key: 'status', header: 'Status' },
  { key: 'message', header: 'Message' },
  { key: 'created_at', header: 'Submitted', type: 'datetime' },
];

async function exportRegistrations(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const status = req.query.status as string | undefined;
    const search = req.query.search as string | undefined;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;

    const conditions: string[] = ['r.deleted_at IS NULL'];
    const params: unknown[] = [];

    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      conditions.push(`r.status = ${params.length + 1}`);
      params.push(status);
    }
    if (search) {
      conditions.push(
        `(LOWER(r.child_name) LIKE ${params.length + 1} OR LOWER(r.parent_name) LIKE ${params.length + 1}`
        + ` OR LOWER(r.parent_email) LIKE ${params.length + 1})`
      );
      params.push(`%${search.toLowerCase()}%`);
    }
    if (dateFrom) {
      conditions.push(`r.created_at >= ${params.length + 1}::date`);
      params.push(dateFrom);
    }
    if (dateTo) {
      conditions.push(`r.created_at < (${params.length + 1}::date + INTERVAL '1 day')`);
      params.push(dateTo);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // The columns this table actually has. It previously selected first_name
    // and last_name, which do not exist here — the export button in the admin
    // panel returned a 500 every time it was pressed.
    const result = await db.query(
      `SELECT r.child_name, r.child_dob, r.parent_name, r.parent_email, r.parent_phone,
              r.status, ag.name AS age_group, r.message, r.created_at
       FROM registrations r
       LEFT JOIN age_groups ag ON r.age_group_id = ag.id
       ${where}
       ORDER BY r.created_at DESC`,
      params
    );

    await sendTabular(res, req, result.rows as Array<Record<string, unknown>>, REGISTRATION_COLUMNS, 'registrations');
  } catch (error) {
    console.error('exportRegistrations failed', error);
    res.status(500).json({ error: 'Failed to export registrations' });
  }
}

const REGISTRATIONS: BulkTarget = {
  table: 'registrations',
  entity: 'registration',
  statuses: ['pending', 'approved', 'rejected'],
};

export function createAdminRegistrationsRouter(db: Pool): express.Router {
  const router = express.Router();
  const resolveAdmin = createResolveAdmin(db);

  router.use(authenticate, resolveAdmin, createResolvePermissions(db), requirePanelAccess);

  router.get('/', requirePermission('view:registrations'), (req, res) => listRegistrations(db, req as AuthRequest, res));
  router.get('/export', requirePermission('view:registrations'), (req, res) => exportRegistrations(db, req as AuthRequest, res));
  router.get('/:id', requirePermission('view:registrations'), (req, res) => getRegistration(db, req as AuthRequest, res));
  router.patch('/:id/status', requirePermission('edit:registrations'), (req, res) => updateRegistrationStatus(db, req as AuthRequest, res));
  router.delete('/:id', requirePermission('delete:registrations'), (req, res) => deleteRegistration(db, req as AuthRequest, res));

  router.post('/bulk/approve', requirePermission('edit:registrations'), (req, res) => bulkStatus(db, req as AuthRequest, res, REGISTRATIONS, 'approved'));
  router.post('/bulk/reject', requirePermission('edit:registrations'), (req, res) => bulkStatus(db, req as AuthRequest, res, REGISTRATIONS, 'rejected'));
  router.post('/bulk/delete', requirePermission('delete:registrations'), (req, res) => bulkDelete(db, req as AuthRequest, res, REGISTRATIONS));

  return router;
}
