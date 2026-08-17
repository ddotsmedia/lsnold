-- Per-admin dashboard layout and theme.
--
-- Numbered 032, the next free one — 031 was the last applied.
--
-- One row per user, unlike the notification settings in 031: how someone
-- arranges their own dashboard, and whether they want a light screen, is
-- personal and costs nothing for two people to disagree about. Who gets
-- emailed is not.
--
-- Additive; 001-031 untouched.

CREATE TABLE IF NOT EXISTS dashboard_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

  -- Widget keys in the order they should appear. Keys the frontend no longer
  -- knows are ignored on read, and new ones are appended, so adding or
  -- retiring a widget never needs a migration.
  widget_order JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Keys the user has switched off. An absent key means visible, so a widget
  -- added later shows up rather than hiding until someone opts in.
  hidden_widgets JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- 'system' follows the operating system setting.
  theme VARCHAR(10) NOT NULL DEFAULT 'dark',

  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE dashboard_preferences
  DROP CONSTRAINT IF EXISTS dashboard_preferences_theme;
ALTER TABLE dashboard_preferences
  ADD CONSTRAINT dashboard_preferences_theme
  CHECK (theme IN ('light', 'dark', 'system'));

-- Both columns hold arrays; anything else would break the reader.
ALTER TABLE dashboard_preferences
  DROP CONSTRAINT IF EXISTS dashboard_preferences_arrays;
ALTER TABLE dashboard_preferences
  ADD CONSTRAINT dashboard_preferences_arrays
  CHECK (
    jsonb_typeof(widget_order) = 'array'
    AND jsonb_typeof(hidden_widgets) = 'array'
  );

-- No seed. A user with no row gets the defaults, which is the same thing as
-- the row this would have created, and avoids leaving rows behind for accounts
-- that never opened the dashboard.
