import { z } from 'zod';

/**
 * Form rules for the browser.
 *
 * These mirror the server's schemas deliberately and are annotated with the
 * file they mirror. The two cannot be shared: the frontend Docker build context
 * is ./apps/frontend, so it cannot import from apps/backend. Duplication is the
 * cost of that boundary, and citing the source is what keeps the copies honest
 * — where they drift, a visitor passes validation here and is rejected by a 400
 * they cannot act on.
 *
 * Where they already disagreed, these follow the SERVER, because the server is
 * what actually decides whether a submission is kept.
 */

/** Mirrors bookingController.ts RegistrationSchema. */
export const RegistrationSchema = z.object({
  child_name: z.string().trim().min(1, "Please enter the child's name").max(255),
  child_dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Please give the date of birth'),
  parent_name: z.string().trim().min(1, 'Please enter your name').max(255),
  parent_email: z.string().trim().email('Please enter a valid email address'),
  // Server: min 7. The old client rule was a pattern that rejected some valid
  // international formats the server would have accepted.
  parent_phone: z.string().trim().min(7, 'Phone number looks too short').max(40),
  age_group_id: z.string().uuid().nullable().optional(),
  message: z.string().trim().max(4000).nullable().optional(),
});
export type RegistrationInput = z.infer<typeof RegistrationSchema>;

/** Mirrors bookingController.ts BookingSchema. Note phone is min 10 here. */
export const TourBookingSchema = z.object({
  visitor_name: z.string().trim().min(1, 'Please enter your name').max(255),
  email: z.string().trim().email('Please enter a valid email address'),
  phone: z.string().trim().min(10, 'Please enter a full phone number'),
  preferred_date: z.string().min(1, 'Please choose a date'),
  time_slot: z.string().min(1, 'Please choose a time'),
});
export type TourBookingInput = z.infer<typeof TourBookingSchema>;

/** Mirrors eventExtrasController.ts EventRegistrationSchema. */
export const EventBookingSchema = z.object({
  child_name: z.string().trim().min(1, "Please enter the child's name").max(255),
  child_dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Please give the date of birth'),
  parent_name: z.string().trim().min(1, 'Please enter your name').max(255),
  parent_email: z.string().trim().email('Please enter a valid email address'),
  parent_phone: z.string().trim().min(7, 'Phone number looks too short').max(40),
  message: z.string().trim().max(4000).nullable().optional(),
});

/**
 * The contact form has no server schema to mirror — there is no contact
 * endpoint at all, so nothing it collects is delivered anywhere. These rules
 * are the ones the form already applied; they will need checking against the
 * server's when that endpoint exists.
 */
export const ContactSchema = z.object({
  name: z.string().trim().min(2, 'Please enter your name'),
  email: z.string().trim().email('Please enter a valid email address'),
  phone: z.string().trim().max(40).optional().or(z.literal('')),
  subject: z.string().min(1, 'Please choose a subject'),
  message: z.string().trim().min(10, 'Please write a little more so we can help'),
  newsletter: z.boolean().default(false),
});
export type ContactInput = z.infer<typeof ContactSchema>;

/** Mirrors routes/admin/pages.ts PageSchema. */
export const AdminPageSchema = z.object({
  title: z.string().trim().min(1, 'A title is required').max(255),
  slug: z.string().trim().min(1, 'A slug is required').max(255)
    .regex(/^[a-z0-9-]+$/, 'Lower-case letters, numbers and hyphens only'),
  meta_title: z.string().max(255).optional().or(z.literal('')),
  meta_description: z.string().optional().or(z.literal('')),
  meta_keywords: z.string().optional().or(z.literal('')),
  og_image: z.string().url('Must be a full URL').optional().or(z.literal('')),
  status: z.enum(['draft', 'published', 'archived']),
});
export type AdminPageInput = z.infer<typeof AdminPageSchema>;
