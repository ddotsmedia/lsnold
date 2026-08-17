-- The notification feed behind the bell in the admin header.
--
-- Numbered 034, the next free one — 033 was the last applied. Note that
-- migration 031 created notification_settings, which is a different thing:
-- that decides whether an email or a text goes out, this is the in-panel list.
--
-- One row per recipient rather than one row with a list of readers: read state
-- is per person, and a shared row would need a second table to record who had
-- seen it, which is the same storage with more joins.
--
-- Additive; 001-033 untouched.

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- e.g. booking_pending, registration_pending. Free text rather than an enum
  -- so a new kind needs no migration; the frontend ignores types it does not
  -- recognise and still shows the title and message.
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT,

  -- The row this is about, and where to go to act on it.
  related_id UUID,
  action_url VARCHAR(500),

  read_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- The bell asks "my unread, newest first" on every page load, which this
-- answers without touching read rows at all.
CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications(user_id, created_at DESC) WHERE read_at IS NULL;

-- The full list asks "mine, newest first".
CREATE INDEX IF NOT EXISTS idx_notifications_user
  ON notifications(user_id, created_at DESC);

-- action_url is written into an href. Anything that is not a path within the
-- panel is refused here as well as in the client, so a bad row cannot become a
-- link off the site.
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_action_url_relative;
ALTER TABLE notifications ADD CONSTRAINT notifications_action_url_relative
  CHECK (action_url IS NULL OR action_url ~ '^/[a-zA-Z0-9/_?=&.-]*$');
