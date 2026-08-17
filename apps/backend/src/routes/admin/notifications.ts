import express from 'express';
import type { Response } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { authenticate, createResolveAdmin } from '../../middleware/auth.js';
import type { AuthRequest } from '../../middleware/auth.js';
import {
  createResolvePermissions,
  requirePermission,
  requirePanelAccess,
} from '../../middleware/permissions.js';
import { isEmailConfigured } from '../../services/emailService.js';
import { isSmsConfigured } from '../../services/smsService.js';
import { logActivity } from '../../utils/activityLog.js';

/**
 * What the nursery is told about, and how.
 *
 * The response reports whether email and SMS are actually configured, so the
 * screen can say "this switch does nothing until credentials are set" rather
 * than letting someone turn on alerts that will never arrive.
 */

const SettingsSchema = z.object({
  email_parent_registration: z.boolean(),
  email_parent_booking: z.boolean(),
  email_admin_registration: z.boolean(),
  email_admin_booking: z.boolean(),
  sms_admin_registration: z.boolean(),
  sms_admin_booking: z.boolean(),
  digest_frequency: z.enum(['immediate', 'hourly', 'daily', 'weekly']),
});

async function getSettings(db: Pool, _req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await db.query('SELECT * FROM notification_settings WHERE id = TRUE');
    res.json({
      settings: result.rows[0] ?? null,
      channels: {
        email: isEmailConfigured(),
        sms: isSmsConfigured(),
        admin_email: Boolean(process.env.MAIL_ADMIN ?? process.env.MAIL_FROM),
        admin_sms: Boolean(process.env.SMS_ADMIN),
      },
    });
  } catch (error) {
    console.error('getSettings failed', error);
    res.status(500).json({ error: 'Failed to load notification settings' });
  }
}

async function updateSettings(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const data = SettingsSchema.parse(req.body);
    const result = await db.query(
      `UPDATE notification_settings SET
         email_parent_registration = $1, email_parent_booking = $2,
         email_admin_registration = $3, email_admin_booking = $4,
         sms_admin_registration = $5, sms_admin_booking = $6,
         digest_frequency = $7, updated_at = NOW(), updated_by = $8
       WHERE id = TRUE RETURNING *`,
      [
        data.email_parent_registration, data.email_parent_booking,
        data.email_admin_registration, data.email_admin_booking,
        data.sms_admin_registration, data.sms_admin_booking,
        data.digest_frequency, req.userId ?? null,
      ]
    );

    await logActivity(db, req.userId, 'update', 'notification_settings', null, {
      newValues: data as unknown as Record<string, unknown>, req,
    });
    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
      return;
    }
    console.error('updateSettings failed', error);
    res.status(500).json({ error: 'Failed to save notification settings' });
  }
}

export function createAdminNotificationsRouter(db: Pool): express.Router {
  const router = express.Router();
  const resolveAdmin = createResolveAdmin(db);

  router.use(authenticate, resolveAdmin, createResolvePermissions(db), requirePanelAccess);

  router.get('/', requirePermission('view:settings'), (req, res) => getSettings(db, req as AuthRequest, res));
  router.put('/', requirePermission('manage:settings'), (req, res) => updateSettings(db, req as AuthRequest, res));

  return router;
}

/* ------------------------------------------------------------------- feed */

/**
 * The bell in the admin header.
 *
 * Every statement is scoped to `req.userId`, so one admin can neither read nor
 * dismiss another's. No permission check beyond panel access: a notification
 * already exists only because its recipient held the permission that produced
 * it (see services/notifications), so checking again here would be the same
 * question asked twice.
 */

async function listNotifications(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const unreadOnly = req.query.unread === 'true';
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));

    const [rows, unread] = await Promise.all([
      db.query(
        `SELECT id, type, title, message, related_id, action_url, read_at, created_at
           FROM notifications
          WHERE user_id = $1 ${unreadOnly ? 'AND read_at IS NULL' : ''}
          ORDER BY created_at DESC
          LIMIT $2`,
        [req.userId, limit]
      ),
      db.query(
        'SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL',
        [req.userId]
      ),
    ]);

    res.json({ notifications: rows.rows, unread: (unread.rows[0] as { n: number }).n });
  } catch (error) {
    console.error('listNotifications failed', error);
    // The bell is decoration on a working panel; an empty list beats an error.
    res.json({ notifications: [], unread: 0 });
  }
}

async function markRead(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await db.query(
      `UPDATE notifications SET read_at = NOW()
        WHERE id = $1 AND user_id = $2 AND read_at IS NULL RETURNING id`,
      [req.params.id, req.userId]
    );
    // Already read is not an error; the client may have raced itself.
    res.json({ updated: result.rowCount ?? 0 });
  } catch (error) {
    if ((error as { code?: string }).code === '22P02') { res.json({ updated: 0 }); return; }
    console.error('markRead failed', error);
    res.status(500).json({ error: 'Failed to mark as read' });
  }
}

async function markAllRead(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await db.query(
      'UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL',
      [req.userId]
    );
    res.json({ updated: result.rowCount ?? 0 });
  } catch (error) {
    console.error('markAllRead failed', error);
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
}

async function dismiss(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await db.query(
      'DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.userId]
    );
    // Someone else's reads as absent rather than forbidden — that it exists is
    // not their business.
    if (result.rows.length === 0) { res.status(404).json({ error: 'Not found' }); return; }
    res.status(204).send();
  } catch (error) {
    if ((error as { code?: string }).code === '22P02') { res.status(404).json({ error: 'Not found' }); return; }
    console.error('dismiss failed', error);
    res.status(500).json({ error: 'Failed to dismiss' });
  }
}

export function createAdminNotificationFeedRouter(db: Pool): express.Router {
  const router = express.Router();
  const resolveAdmin = createResolveAdmin(db);

  router.use(authenticate, resolveAdmin, createResolvePermissions(db), requirePanelAccess);

  router.get('/', (req, res) => listNotifications(db, req as AuthRequest, res));
  router.post('/mark-all-read', (req, res) => markAllRead(db, req as AuthRequest, res));
  router.put('/:id/read', (req, res) => markRead(db, req as AuthRequest, res));
  router.delete('/:id', (req, res) => dismiss(db, req as AuthRequest, res));

  return router;
}
