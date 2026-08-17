import type { Pool } from 'pg';
import { emitToRoom } from '../realtime.js';

/**
 * The in-panel notification feed.
 *
 * Distinct from notification_settings (migration 031), which decides whether an
 * email or a text goes out. This is the bell in the header, and it is not
 * subject to those settings: an admin who has turned off email alerts still
 * wants to see a new registration when they open the panel.
 *
 * Who receives one is decided by permission, not by role, so it stays correct
 * if the permission matrix is edited on the Roles screen.
 */

export interface NewNotification {
  type: string;
  title: string;
  message?: string | null;
  relatedId?: string | null;
  /** A path inside the panel. Rejected by a CHECK if it is anything else. */
  actionUrl?: string | null;
}

/**
 * Creates one notification for every active user holding `permission`, and
 * pushes it to any of them with the panel open.
 *
 * Fails quietly. It is called from the path that has just saved a booking or a
 * registration, and a notification problem must not turn that into an error the
 * family sees.
 */
export async function notifyUsersWith(
  db: Pool,
  permission: string,
  notification: NewNotification
): Promise<number> {
  try {
    const result = await db.query(
      `INSERT INTO notifications (user_id, type, title, message, related_id, action_url)
       SELECT u.id, $1, $2, $3, $4::uuid, $5
         FROM users u
         JOIN roles r ON r.name = u.role
         JOIN role_permissions rp ON rp.role_id = r.id
         JOIN permissions p ON p.id = rp.permission_id
        WHERE u.is_active IS NOT FALSE AND p.name = $6
       RETURNING id, user_id, type, title, message, related_id, action_url, read_at, created_at`,
      [
        notification.type,
        notification.title,
        notification.message ?? null,
        notification.relatedId ?? null,
        notification.actionUrl ?? null,
        permission,
      ]
    );

    // A room per user: a notification belongs to one person, so a shared room
    // would deliver everyone's to everyone.
    for (const row of result.rows as Array<{ user_id: string }>) {
      emitToRoom(`user:${row.user_id}`, 'notification:created', row);
    }
    return result.rowCount ?? 0;
  } catch (error) {
    console.error('notifyUsersWith failed', error);
    return 0;
  }
}

export async function notifyNewRegistration(
  db: Pool,
  row: { id: string; child_name: string; parent_name: string }
): Promise<void> {
  await notifyUsersWith(db, 'view:registrations', {
    type: 'registration_pending',
    title: 'New registration',
    message: `${row.child_name}, submitted by ${row.parent_name}`,
    relatedId: row.id,
    actionUrl: '/admin/registrations',
  });
}

export async function notifyNewBooking(
  db: Pool,
  row: { id: string; visitor_name: string; preferred_date: string | Date; preferred_time: string }
): Promise<void> {
  const date = row.preferred_date instanceof Date
    ? row.preferred_date.toISOString().slice(0, 10)
    : String(row.preferred_date).slice(0, 10);

  await notifyUsersWith(db, 'view:bookings', {
    type: 'booking_pending',
    title: 'New tour booking',
    message: `${row.visitor_name} — ${date} at ${row.preferred_time}`,
    relatedId: row.id,
    actionUrl: '/admin/bookings',
  });
}
