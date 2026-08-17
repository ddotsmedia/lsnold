-- Soft delete for registrations and tour bookings.
--
-- Numbered 035, the next free one — 034 was the last applied.
--
-- Both tables were deleted from with a plain DELETE, which is unrecoverable.
-- These rows hold a child's name and date of birth and a parent's email and
-- phone: a misclick on the wrong row loses a family's enquiry with no way back.
-- Every other table in this schema that an admin can delete from already works
-- this way; these two were the exception.
--
-- Additive; 001-034 untouched.

ALTER TABLE registrations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE tour_bookings ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

-- Every read is "live rows, newest first", so the indexes exclude the rest.
CREATE INDEX IF NOT EXISTS idx_registrations_live
  ON registrations(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tour_bookings_live
  ON tour_bookings(preferred_date DESC) WHERE deleted_at IS NULL;

-- The slot-availability check must not count a deleted booking as taken, or a
-- deleted row would block that time forever.
CREATE INDEX IF NOT EXISTS idx_tour_bookings_slot_live
  ON tour_bookings(preferred_date, preferred_time)
  WHERE deleted_at IS NULL AND status <> 'cancelled';
