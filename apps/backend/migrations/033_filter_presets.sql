-- Saved table filters.
--
-- Numbered 033, the next free one — 032 was the last applied.
--
-- Per user, like the dashboard layout in 032: a saved filter is a personal
-- shortcut, and two admins wanting different ones costs nothing.
--
-- Additive; 001-032 untouched.

CREATE TABLE IF NOT EXISTS filter_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Which screen the preset belongs to, e.g. 'bookings', 'registrations'.
  screen VARCHAR(50) NOT NULL,
  name VARCHAR(80) NOT NULL,

  -- The query parameters as given, so a preset keeps working when a screen
  -- gains a filter it did not have when the preset was saved.
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMP DEFAULT NOW()
);

-- One name per screen per person, so saving twice updates rather than
-- accumulating near-identical entries.
CREATE UNIQUE INDEX IF NOT EXISTS idx_filter_presets_unique
  ON filter_presets(user_id, screen, lower(name));

CREATE INDEX IF NOT EXISTS idx_filter_presets_lookup
  ON filter_presets(user_id, screen);

ALTER TABLE filter_presets DROP CONSTRAINT IF EXISTS filter_presets_object;
ALTER TABLE filter_presets ADD CONSTRAINT filter_presets_object
  CHECK (jsonb_typeof(filters) = 'object');
