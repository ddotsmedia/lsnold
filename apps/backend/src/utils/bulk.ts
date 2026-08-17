import type { Response } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import { logActivity } from './activityLog.js';

/**
 * Bulk status changes and deletions for the admin tables.
 *
 * One implementation for both screens, so "approve twenty" cannot mean
 * something subtly different on one of them.
 *
 * A note on the brief's "verify all IDs belong to current user": these rows do
 * not belong to an admin. A registration is submitted by a family and a tour is
 * booked by a visitor — there is no owner column to check against. The boundary
 * that actually applies is the permission on the route (edit:registrations,
 * delete:bookings and so on), which RBAC already enforces. What is checked here
 * instead is that every id names a live row in the right table, and the count
 * that comes back is the count actually changed.
 */

const BulkIdsSchema = z.object({
  // Capped so one request cannot rewrite the whole table by accident.
  ids: z.array(z.string().uuid()).min(1, 'Select at least one row').max(500),
});

export interface BulkTarget {
  table: 'registrations' | 'tour_bookings';
  /** For the activity log. */
  entity: string;
  /** Statuses this table accepts, so a bad one cannot be written. */
  statuses: readonly string[];
}

/** Applies a status to many rows at once. */
export async function bulkStatus(
  db: Pool,
  req: AuthRequest,
  res: Response,
  target: BulkTarget,
  status: string
): Promise<void> {
  try {
    if (!target.statuses.includes(status)) {
      res.status(400).json({ error: `Unknown status "${status}"` });
      return;
    }

    const { ids } = BulkIdsSchema.parse(req.body);
    const result = await db.query(
      `UPDATE ${target.table}
          SET status = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ANY($2::uuid[]) AND deleted_at IS NULL
        RETURNING id`,
      [status, ids]
    );

    const updated = result.rowCount ?? 0;
    await logActivity(db, req.userId, 'status_change', target.entity, ids[0] as string, {
      newValues: { action: 'bulk', status, requested: ids.length, updated }, req,
    });

    // The rows actually changed, not the number asked for: an id that is
    // already deleted, or belongs to nothing, matches nothing, and reporting
    // the request length would hide that from the person who pressed the button.
    res.json({ updated, requested: ids.length, status });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
      return;
    }
    console.error(`bulk status on ${target.table} failed`, error);
    res.status(500).json({ error: 'Failed to update the selected rows' });
  }
}

/** Soft-deletes many rows at once. */
export async function bulkDelete(
  db: Pool,
  req: AuthRequest,
  res: Response,
  target: BulkTarget
): Promise<void> {
  try {
    const { ids } = BulkIdsSchema.parse(req.body);
    const result = await db.query(
      `UPDATE ${target.table} SET deleted_at = NOW()
        WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL
        RETURNING id`,
      [ids]
    );

    const deleted = result.rowCount ?? 0;
    await logActivity(db, req.userId, 'delete', target.entity, ids[0] as string, {
      newValues: { action: 'bulk', requested: ids.length, deleted }, req,
    });
    res.json({ deleted, requested: ids.length });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
      return;
    }
    console.error(`bulk delete on ${target.table} failed`, error);
    res.status(500).json({ error: 'Failed to delete the selected rows' });
  }
}
