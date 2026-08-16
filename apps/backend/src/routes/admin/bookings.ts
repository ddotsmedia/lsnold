import express from 'express';
import type { Response } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { authenticate, createResolveAdmin, requireAdmin } from '../../middleware/auth.js';
import { createResolvePermissions, requirePermission, requirePanelAccess } from '../../middleware/permissions.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { logActivity } from '../../utils/activityLog.js';

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

    const allowedSorts = ['preferred_date', 'created_at', 'visitor_name', 'email', 'status'];
    const safeSort = allowedSorts.includes(sortBy) ? sortBy : 'preferred_date';

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (status && ['pending', 'confirmed', 'cancelled'].includes(status)) {
      conditions.push(`status = $${paramIdx++}`);
      params.push(status);
    }

    if (search) {
      conditions.push(
        `(LOWER(visitor_name) LIKE $${paramIdx} OR LOWER(email) LIKE $${paramIdx})`
      );
      params.push(`%${search.toLowerCase()}%`);
      paramIdx++;
    }

    if (dateFrom) {
      conditions.push(`preferred_date >= $${paramIdx++}::timestamp`);
      params.push(dateFrom);
    }

    if (dateTo) {
      conditions.push(`preferred_date <= $${paramIdx++}::timestamp`);
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
    const result = await db.query('SELECT * FROM tour_bookings WHERE id = $1', [id]);
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
      `UPDATE tour_bookings SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
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
    const result = await db.query('DELETE FROM tour_bookings WHERE id = $1 RETURNING id', [id]);
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

async function exportBookings(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const status = req.query.status as string | undefined;
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (status && ['pending', 'confirmed', 'cancelled'].includes(status)) {
      conditions.push('status = $1');
      params.push(status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await db.query(
      `SELECT visitor_name, email, phone, preferred_date, time_slot, status, created_at
       FROM tour_bookings ${where} ORDER BY preferred_date DESC`,
      params
    );

    const header = 'Visitor Name,Email,Phone,Preferred Date,Time Slot,Status,Created\n';
    const csv = result.rows.map((r: Record<string, unknown>) =>
      `"${r.visitor_name}","${r.email}","${r.phone}","${r.preferred_date}","${r.time_slot}","${r.status}","${r.created_at}"`
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=tour-bookings.csv');
    res.send(header + csv);
  } catch (error) {
    console.error('exportBookings failed', error);
    res.status(500).json({ error: 'Failed to export bookings' });
  }
}

export function createAdminBookingsRouter(db: Pool): express.Router {
  const router = express.Router();
  const resolveAdmin = createResolveAdmin(db);

  router.use(authenticate, resolveAdmin, createResolvePermissions(db), requirePanelAccess);

  router.get('/', requirePermission('view:bookings'), (req, res) => listBookings(db, req as AuthRequest, res));
  router.get('/export', requirePermission('view:bookings'), (req, res) => exportBookings(db, req as AuthRequest, res));
  router.get('/:id', requirePermission('view:bookings'), (req, res) => getBooking(db, req as AuthRequest, res));
  router.patch('/:id/status', requirePermission('edit:bookings'), (req, res) => updateBookingStatus(db, req as AuthRequest, res));
  router.delete('/:id', requirePermission('delete:bookings'), (req, res) => deleteBooking(db, req as AuthRequest, res));

  return router;
}
