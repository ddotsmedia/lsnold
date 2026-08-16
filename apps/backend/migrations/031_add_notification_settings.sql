-- What the nursery wants to be told about, and how.
--
-- Numbered 031, the next free one — 030 was the last applied and no 031 exists.
--
-- A single row, not one per user. The alerts are about the nursery's inbox and
-- its phone, not about an individual administrator's preferences: there is one
-- info@ address and one mobile, and two admins toggling each other's settings
-- would be confusing rather than useful. If per-user preferences are wanted
-- later, add a nullable user_id and treat NULL as the house default.
--
-- Additive; 001-030 untouched.

CREATE TABLE IF NOT EXISTS notification_settings (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE,

  -- Confirmations sent to the family. On by default: the site already tells
  -- them to expect one.
  email_parent_registration BOOLEAN NOT NULL DEFAULT TRUE,
  email_parent_booking      BOOLEAN NOT NULL DEFAULT TRUE,

  -- Alerts sent to the nursery.
  email_admin_registration  BOOLEAN NOT NULL DEFAULT TRUE,
  email_admin_booking       BOOLEAN NOT NULL DEFAULT TRUE,
  sms_admin_registration    BOOLEAN NOT NULL DEFAULT FALSE,
  sms_admin_booking         BOOLEAN NOT NULL DEFAULT FALSE,

  digest_frequency VARCHAR(20) NOT NULL DEFAULT 'immediate',

  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Forces the single row: id can only ever be TRUE.
  CONSTRAINT notification_settings_single_row CHECK (id)
);

ALTER TABLE notification_settings
  DROP CONSTRAINT IF EXISTS notification_settings_digest_frequency;
ALTER TABLE notification_settings
  ADD CONSTRAINT notification_settings_digest_frequency
  CHECK (digest_frequency IN ('immediate', 'hourly', 'daily', 'weekly'));

-- The defaults above are the row. Re-running leaves an edited row alone.
INSERT INTO notification_settings (id) VALUES (TRUE)
ON CONFLICT (id) DO NOTHING;

-- SMS defaults to off deliberately. It costs money per message and UAE sender
-- IDs need registering before anything arrives, so it should be switched on
-- knowingly rather than start firing the moment credentials appear.
