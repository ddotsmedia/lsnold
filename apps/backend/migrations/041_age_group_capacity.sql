-- How many children each room can take.
--
-- Numbered 041, the next free one — 040 was the last applied.
--
-- The class capacity treemap has been asked for three times and could not be
-- built, because nothing in the schema said how full a room is allowed to get.
-- registrations already carries age_group_id, so the numerator existed; this is
-- the missing denominator.
--
-- Left NULL rather than guessed. A capacity is a fact about a real room — its
-- floor area, its staffing ratio, its licence — and inventing plausible numbers
-- would put figures on a dashboard that nobody chose and everybody would come
-- to trust. The treemap shows the rooms that have one and says plainly how many
-- do not.
--
-- Additive; 001-040 untouched.

ALTER TABLE age_groups ADD COLUMN IF NOT EXISTS capacity INTEGER;

-- A room with a capacity of zero or a negative one is a data-entry slip, not a
-- closed room; closing a room is what deleted_at is for.
ALTER TABLE age_groups DROP CONSTRAINT IF EXISTS age_groups_capacity_positive;
ALTER TABLE age_groups ADD CONSTRAINT age_groups_capacity_positive
  CHECK (capacity IS NULL OR capacity > 0);

COMMENT ON COLUMN age_groups.capacity IS
  'Maximum children this room can hold. NULL means not yet recorded, which is
   not the same as unlimited — the capacity treemap skips these rather than
   treating them as having room.';

-- The treemap groups approved registrations by room; without this it is a
-- sequential scan per room on every load.
CREATE INDEX IF NOT EXISTS idx_registrations_age_group
  ON registrations (age_group_id)
  WHERE deleted_at IS NULL;
