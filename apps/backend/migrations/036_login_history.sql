-- Who signed in, when, and from where. Plus forcing a password change.
--
-- Numbered 036, the next free one — 035 was the last applied.
--
-- No `disabled` column. users.is_active already exists and is already what
-- decides access: resolveAdmin and resolvePermissions both read it. A second
-- flag would be two answers to one question, and the pair would drift the first
-- time something set one and not the other.
--
-- Additive; 001-035 untouched.

CREATE TABLE IF NOT EXISTS login_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Recorded for failures too: a run of refusals against one account is the
  -- thing worth noticing, and it is invisible if only successes are kept.
  succeeded BOOLEAN NOT NULL DEFAULT TRUE,
  /** Why a sign-in was refused: bad_password, inactive. NULL when it worked. */
  failure_reason VARCHAR(40),

  ip_address VARCHAR(64),
  user_agent TEXT,
  device_type VARCHAR(20),
  browser VARCHAR(40),

  created_at TIMESTAMP DEFAULT NOW()
);

-- The screen asks "this account, most recent first".
CREATE INDEX IF NOT EXISTS idx_login_history_user
  ON login_history(user_id, created_at DESC);

-- And "recent failures", for spotting an account being hammered.
CREATE INDEX IF NOT EXISTS idx_login_history_failures
  ON login_history(created_at DESC) WHERE NOT succeeded;

-- Forces a change at the next sign-in. Nullable rather than defaulted to false
-- so existing accounts are untouched.
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_required BOOLEAN NOT NULL DEFAULT FALSE;

-- When the account last signed in successfully. Derivable from login_history,
-- but kept here so the users list does not need a correlated subquery per row.
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;
