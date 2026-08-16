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
