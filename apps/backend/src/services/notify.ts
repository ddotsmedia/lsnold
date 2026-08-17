import type { Pool } from 'pg';
import { sendRegistrationEmail, sendBookingConfirmation, sendAdminAlert } from './emailService.js';
import { sendAdminSms } from './smsService.js';
import { notifyNewRegistration, notifyNewBooking } from './notifications.js';

/**
 * Decides what to send when something arrives, and sends it.
 *
 * Kept apart from the controllers so the rules live in one place: a controller
 * says "a registration happened", not "email the parent unless a checkbox".
 *
 * Every path is best effort and swallows its own failures. The row is already
 * saved by the time this runs, and a mail or SMS outage must never turn a
 * successful submission into an error a family sees.
 */

export interface NotificationSettings {
  email_parent_registration: boolean;
  email_parent_booking: boolean;
  email_admin_registration: boolean;
  email_admin_booking: boolean;
  sms_admin_registration: boolean;
  sms_admin_booking: boolean;
  digest_frequency: string;
}

/** Everything off if the row or the table is missing, so a failed lookup cannot spam. */
const OFF: NotificationSettings = {
  email_parent_registration: false,
  email_parent_booking: false,
  email_admin_registration: false,
  email_admin_booking: false,
  sms_admin_registration: false,
  sms_admin_booking: false,
  digest_frequency: 'immediate',
};

export async function getSettings(db: Pool): Promise<NotificationSettings> {
  try {
    const result = await db.query('SELECT * FROM notification_settings WHERE id = TRUE');
    return (result.rows[0] as NotificationSettings) ?? OFF;
  } catch (error) {
    console.error('notification settings lookup failed', error);
    return OFF;
  }
}

interface RegistrationLike {
  id: string;
  child_name: string;
  parent_name: string;
  parent_email: string;
  parent_phone: string;
}

export async function notifyRegistration(db: Pool, row: RegistrationLike): Promise<void> {
  try {
    await notifyNewRegistration(db, row);

    const settings = await getSettings(db);

    if (settings.email_parent_registration) {
      await sendRegistrationEmail(row.parent_email, row.child_name);
    }
    if (settings.email_admin_registration && settings.digest_frequency === 'immediate') {
      await sendAdminAlert('New registration', [
        `Child: ${row.child_name}`,
        `Parent: ${row.parent_name}`,
        `Email: ${row.parent_email}`,
        `Phone: ${row.parent_phone}`,
      ]);
    }
    if (settings.sms_admin_registration) {
      await sendAdminSms(`New registration: ${row.child_name} (${row.parent_phone})`);
    }
  } catch (error) {
    console.error('notifyRegistration failed', error);
  }
}

interface BookingLike {
  id: string;
  visitor_name: string;
  visitor_email: string;
  visitor_phone: string;
  preferred_date: string | Date;
  preferred_time: string;
}

export async function notifyBooking(db: Pool, row: BookingLike): Promise<void> {
  try {
    await notifyNewBooking(db, row);

    const settings = await getSettings(db);
    const date = row.preferred_date instanceof Date
      ? row.preferred_date.toISOString()
      : String(row.preferred_date);

    if (settings.email_parent_booking) {
      await sendBookingConfirmation(row.visitor_email, date, row.preferred_time);
    }
    if (settings.email_admin_booking && settings.digest_frequency === 'immediate') {
      await sendAdminAlert('New tour booking', [
        `Visitor: ${row.visitor_name}`,
        `When: ${date.slice(0, 10)} at ${row.preferred_time}`,
        `Email: ${row.visitor_email}`,
        `Phone: ${row.visitor_phone}`,
      ]);
    }
    if (settings.sms_admin_booking) {
      await sendAdminSms(`New tour: ${row.visitor_name}, ${date.slice(0, 10)} ${row.preferred_time}`);
    }
  } catch (error) {
    console.error('notifyBooking failed', error);
  }
}
