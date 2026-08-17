import type { Response } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import { notifyRegistration, notifyBooking } from '../services/notify.js';
import { emitToRoom } from '../realtime.js';
import type { Registration, TourBooking } from '../types/index.js';

/** The only slots a tour can be booked into. */
export const TIME_SLOTS = ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'] as const;

/**
 * Matches registrations as it exists: child_name, child_dob, parent_name,
 * parent_email, parent_phone. The previous schema described first_name,
 * last_name, email and phone — columns the table does not have — so every
 * submission failed with `column "first_name" does not exist`, whatever
 * age_group_id was sent.
 */
const RegistrationSchema = z.object({
  child_name: z.string().trim().min(1, 'Child name is required').max(255),
  child_dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be YYYY-MM-DD'),
  parent_name: z.string().trim().min(1, 'Parent name is required').max(255),
  parent_email: z.string().email(),
  parent_phone: z.string().trim().min(7, 'Phone number looks too short').max(40),
  // Optional: a registration without a chosen programme is still worth keeping.
  age_group_id: z.string().uuid('Age group must be a valid id').nullable().optional(),
  message: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().trim().max(4000).nullable().optional()
  ),
});

const BookingSchema = z.object({
  visitor_name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(10),
  preferred_date: z.string().datetime(),
  time_slot: z.enum(TIME_SLOTS),
});

const AvailabilitySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
});

// Registrations
export async function createRegistration(
  db: Pool,
  req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const data = RegistrationSchema.parse(req.body);
    const result = await db.query(
      `INSERT INTO registrations
         (child_name, child_dob, parent_name, parent_email, parent_phone, age_group_id, message, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending') RETURNING *`,
      [
        data.child_name, data.child_dob, data.parent_name,
        data.parent_email, data.parent_phone,
        data.age_group_id ?? null, data.message ?? null,
      ]
    );
    const registration = result.rows[0] as Registration;

    // Lands in any open admin panel whose user may see registrations. Failure
    // is swallowed inside emitToRoom — the row is saved either way, and the
    // page still shows it on the next load.
    emitToRoom('registrations', 'registration:created', registration);

    // Confirmation to the family and an alert to the nursery, each subject to
    // the notification settings. notifyRegistration swallows its own failures:
    // the row is already saved, and a mail outage must not turn a successful
    // submission into an error the family sees.
    await notifyRegistration(db, registration);

    res.status(201).json(registration);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
      return;
    }
    // age_group_id must reference an existing age_groups row — that is bad
    // client input, not a server fault.
    if (typeof error === 'object' && error !== null && (error as { code?: string }).code === '23503') {
      res.status(400).json({ error: 'Unknown age group' });
      return;
    }
    console.error('createRegistration failed', error);
    res.status(500).json({ error: 'Failed to create registration' });
  }
}

export async function getRegistrations(
  db: Pool,
  _req: AuthRequest,
  res: Response
): Promise<void> {
  try {
    const result = await db.query('SELECT * FROM registrations WHERE deleted_at IS NULL ORDER BY created_at DESC');
    res.json(result.rows as Registration[]);
  } catch (error) {
    console.error('getRegistrations failed', error);
    res.status(500).json({ error: 'Failed to fetch registrations' });
  }
}

// Tour Bookings
export async function getAvailability(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { date } = AvailabilitySchema.parse(req.query);

    const booked = await db.query(
      `SELECT to_char(preferred_time, 'HH24:MI') AS slot
         FROM tour_bookings WHERE preferred_date = $1::date AND status != $2 AND deleted_at IS NULL`,
      [date, 'cancelled']
    );
    // Formatted back to HH:MM to match TIME_SLOTS — a TIME column comes back
    // as '09:00:00', which would never equal '09:00'.
    const bookedSlots = booked.rows.map((r: { slot: string }) => r.slot);
    const available = TIME_SLOTS.filter((slot) => !bookedSlots.includes(slot));
    res.json({ date, available, booked: bookedSlots });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
    } else {
      console.error('getAvailability failed', error);
      res.status(500).json({ error: 'Failed to fetch availability' });
    }
  }
}

export async function createBooking(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const data = BookingSchema.parse(req.body);

    // Conditional insert so a slot cannot be claimed twice between the
    // availability check and the write. $4 is cast to `timestamp` (not
    // `timestamptz`) to match the column type and the expression in
    // idx_tour_bookings_slot_unique — a timestamptz cast would resolve the
    // date in the server's timezone and could disagree with the index.
    const result = await db.query(
      // The columns this table actually has: visitor_email, visitor_phone and
      // preferred_time. The code wrote email, phone and time_slot, so every
      // tour booking failed with "column email does not exist" — the form has
      // never once succeeded. preferred_date is a DATE and preferred_time a
      // TIME, so the incoming ISO datetime is split rather than stored whole.
      `INSERT INTO tour_bookings (visitor_name, visitor_email, visitor_phone, preferred_date, preferred_time, status)
       SELECT $1::varchar, $2::varchar, $3::varchar, $4::date, $5::time, $6::varchar
       WHERE NOT EXISTS (
         SELECT 1 FROM tour_bookings
         WHERE preferred_date = $4::date
           AND preferred_time = $5::time
           AND status != 'cancelled'
           AND deleted_at IS NULL
       )
       RETURNING *`,
      [
        data.visitor_name, data.email, data.phone,
        data.preferred_date.slice(0, 10), data.time_slot, 'pending',
      ]
    );

    if (result.rows.length === 0) {
      res.status(409).json({ error: 'Time slot already booked' });
      return;
    }

    const booking = result.rows[0] as TourBooking;
    emitToRoom('bookings', 'booking:created', booking);
    await notifyBooking(db, booking);
    res.status(201).json(booking);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
      return;
    }
    // Two requests can pass the NOT EXISTS check concurrently; the unique index
    // is what actually settles it. Report that as a conflict, not a server error.
    if (typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'Time slot already booked' });
      return;
    }
    console.error('createBooking failed', error);
    res.status(500).json({ error: 'Failed to create booking' });
  }
}

export async function getBookings(db: Pool, _req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await db.query('SELECT * FROM tour_bookings WHERE deleted_at IS NULL ORDER BY preferred_date DESC');
    res.json(result.rows as TourBooking[]);
  } catch (error) {
    console.error('getBookings failed', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
}
