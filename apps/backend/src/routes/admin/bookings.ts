import express from 'express';
import type { Response } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { authenticate, createResolveAdmin, requireAdmin } from '../../middleware/auth.js';
import { createResolvePermissions, requirePermission, requirePanelAccess } from '../../middleware/permissions.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { sendTabular, type Column } from '../../utils/tabular.js';
import { logActivity } from '../../utils/activityLog.js';
import { bulkStatus, bulkDelete, type BulkTarget } from '../../utils/bulk.js';

const StatusSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'cancelled']),
  notes: z.string().optional(),
});

async function listBookings(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const status = req.query.status as string | undefined;
    const search = req.query.search as string | undefined;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const sortBy = req.query.sortBy as string || 'preferred_date';
    const sortDir = req.query.sortDir === 'asc' ? 'ASC' : 'DESC';

    const allowedSorts = ['preferred_date', 'created_at', 'visitor_name', 'visitor_email', 'status'];
    const safeSort = allowedSorts.includes(sortBy) ? sortBy : 'preferred_date';

    // Deleted rows are excluded everywhere; this is the base of every filter.
    const conditions: string[] = ['deleted_at IS NULL'];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (status && ['pending', 'confirmed', 'cancelled'].includes(status)) {
      conditions.push(`status = $${paramIdx++}`);
      params.push(status);
    }

    if (search) {
      conditions.push(
        `(LOWER(visitor_name) LIKE $${paramIdx} OR LOWER(visitor_email) LIKE $${paramIdx})`
      );
      params.push(`%${search.toLowerCase()}%`);
      paramIdx++;
    }

    if (dateFrom) {
      conditions.push(`preferred_date >= $${paramIdx++}::date`);
      params.push(dateFrom);
    }

    if (dateTo) {
      conditions.push(`preferred_date <= $${paramIdx++}::date`);
      params.push(dateTo);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await db.query(
      `SELECT COUNT(*) FROM tour_bookings ${where}`,
      params
    );
    const total = Number(countResult.rows[0]?.count ?? 0);

    const dataResult = await db.query(
      `SELECT * FROM tour_bookings ${where}
       ORDER BY ${safeSort} ${sortDir}
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
    console.error('listBookings failed', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
}

async function getBooking(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT * FROM tour_bookings WHERE id = $1 AND deleted_at IS NULL', [id]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('getBooking failed', error);
    res.status(500).json({ error: 'Failed to fetch booking' });
  }
}

async function updateBookingStatus(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const data = StatusSchema.parse(req.body);

    const result = await db.query(
      `UPDATE tour_bookings SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND deleted_at IS NULL RETURNING *`,
      [data.status, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }

    await logActivity(db, req.userId, 'status_change', 'tour_booking', id, {
      newStatus: data.status,
      notes: data.notes,
    });

    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
      return;
    }
    console.error('updateBookingStatus failed', error);
    res.status(500).json({ error: 'Failed to update booking status' });
  }
}

async function deleteBooking(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    // Soft: these rows carry a family's contact details, and a misclick on
    // the wrong one should not be unrecoverable.
    const result = await db.query(
      'UPDATE tour_bookings SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id',
      [id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }
    await logActivity(db, req.userId, 'delete', 'tour_booking', id);
    res.status(204).send();
  } catch (error) {
    console.error('deleteBooking failed', error);
    res.status(500).json({ error: 'Failed to delete booking' });
  }
}

const BOOKING_COLUMNS: Column[] = [
  { key: 'visitor_name', header: 'Visitor' },
  { key: 'visitor_email', header: 'Email' },
  { key: 'visitor_phone', header: 'Phone' },
  { key: 'preferred_date', header: 'Preferred date', type: 'date' },
  { key: 'preferred_time', header: 'Time slot' },
  { key: 'number_of_children', header: 'Children' },
  { key: 'message', header: 'Message' },
  { key: 'status', header: 'Status' },
  { key: 'created_at', header: 'Booked', type: 'datetime' },
];

async function exportBookings(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    // The same filters the list applies. Exporting only by status would give a
    // file that disagrees with the screen it was exported from.
    const status = req.query.status as string | undefined;
    const search = req.query.search as string | undefined;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;

    const conditions: string[] = ['deleted_at IS NULL'];
    const params: unknown[] = [];
    let idx = 1;

    if (status && ['pending', 'confirmed', 'cancelled'].includes(status)) {
      conditions.push(`status = $${idx++}`);
      params.push(status);
    }
    if (search) {
      conditions.push(`(LOWER(visitor_name) LIKE $${idx} OR LOWER(visitor_email) LIKE $${idx})`);
      params.push(`%${search.toLowerCase()}%`);
      idx++;
    }
    if (dateFrom) { conditions.push(`preferred_date >= $${idx++}::date`); params.push(dateFrom); }
    if (dateTo) { conditions.push(`preferred_date <= $${idx++}::date`); params.push(dateTo); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await db.query(
      `SELECT visitor_name, visitor_email, visitor_phone, preferred_date,
              to_char(preferred_time, 'HH24:MI') AS preferred_time,
              number_of_children, status, message, created_at
         FROM tour_bookings ${where} ORDER BY preferred_date DESC`,
      params
    );

    await sendTabular(res, req, result.rows as Array<Record<string, unknown>>, BOOKING_COLUMNS, 'tour-bookings');
  } catch (error) {
    console.error('exportBookings failed', error);
    res.status(500).json({ error: 'Failed to export bookings' });
  }
}

const BOOKINGS: BulkTarget = {
  table: 'tour_bookings',
  entity: 'tour_booking',
  statuses: ['pending', 'confirmed', 'cancelled'],
};

export function createAdminBookingsRouter(db: Pool): express.Router {
  const router = express.Router();
  const resolveAdmin = createResolveAdmin(db);

  router.use(authenticate, resolveAdmin, createResolvePermissions(db), requirePanelAccess);

  router.get('/', requirePermission('view:bookings'), (req, res) => listBookings(db, req as AuthRequest, res));
  router.get('/export', requirePermission('view:bookings'), (req, res) => exportBookings(db, req as AuthRequest, res));
  router.get('/:id', requirePermission('view:bookings'), (req, res) => getBooking(db, req as AuthRequest, res));
  router.patch('/:id/status', requirePermission('edit:bookings'), (req, res) => updateBookingStatus(db, req as AuthRequest, res));
  router.delete('/:id', requirePermission('delete:bookings'), (req, res) => deleteBooking(db, req as AuthRequest, res));

  // Bulk. Registered after /:id — different paths, so no shadowing, and each
  // needs the same permission as doing it one row at a time.
  router.post('/bulk/confirm', requirePermission('edit:bookings'), (req, res) => bulkStatus(db, req as AuthRequest, res, BOOKINGS, 'confirmed'));
  router.post('/bulk/cancel', requirePermission('edit:bookings'), (req, res) => bulkStatus(db, req as AuthRequest, res, BOOKINGS, 'cancelled'));
  router.post('/bulk/delete', requirePermission('delete:bookings'), (req, res) => bulkDelete(db, req as AuthRequest, res, BOOKINGS));

  return router;
}
