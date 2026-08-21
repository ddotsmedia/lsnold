-- A read-only database role for Grafana.
--
-- Numbered 040, the next free one — 039 was the last applied.
--
-- Grafana's SQL panels let anyone who can log in run whatever query they like.
-- Connecting it as the owning user would mean a Grafana session could DELETE,
-- DROP or UPDATE; this role can only SELECT, so the worst a compromise can do
-- is read — which is bad enough to justify the rest of the precautions around
-- it, but is not the same as losing the data.
--
-- The password is supplied at apply time rather than written here, so it never
-- enters the repository:
--   psql -v grafana_password="'...'" -f 040_grafana_readonly_role.sql
--
-- Additive; 001-039 untouched.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'grafana_ro') THEN
    -- NOLOGIN until the password is set below, so the role never exists in a
    -- connectable state without one.
    CREATE ROLE grafana_ro NOLOGIN;
  END IF;
END
$$;

-- Only when a password was actually supplied. Applying the whole directory in
-- order — a rebuild, or infra/scripts/deploy.sh — passes no psql variables, and
-- an unset :grafana_password is a syntax error that halted the run under
-- ON_ERROR_STOP and stopped every later migration.
--
-- Skipping it leaves the role exactly as the block above created it: NOLOGIN,
-- so it still never exists in a connectable state without a password.
\if :{?grafana_password}
ALTER ROLE grafana_ro LOGIN PASSWORD :grafana_password;
\else
\echo '040: grafana_password not supplied - grafana_ro left NOLOGIN. Re-run with -v grafana_password="''...''" to enable it.'
\endif

-- Explicitly not CREATE: the role cannot add objects of its own.
GRANT CONNECT ON DATABASE littlesmarties TO grafana_ro;
GRANT USAGE ON SCHEMA public TO grafana_ro;

GRANT SELECT ON ALL TABLES IN SCHEMA public TO grafana_ro;

-- Tables added by later migrations would otherwise be invisible, and someone
-- would eventually "fix" that by granting the role more than it needs.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO grafana_ro;

-- Two tables this role has no business reading. Dashboards are about counts and
-- trends; nothing in Grafana needs a password hash or a live session token, and
-- a read-only role that can still read credentials is not really read-only in
-- any sense that matters.
REVOKE SELECT ON users FROM grafana_ro;
REVOKE SELECT ON refresh_tokens FROM grafana_ro;

-- A view giving back the parts of users a dashboard legitimately needs, without
-- the password hash. Counting admins by role is reasonable; reading their
-- credentials is not.
CREATE OR REPLACE VIEW grafana_users AS
  SELECT id, role, is_active, last_login_at, created_at
    FROM users;

GRANT SELECT ON grafana_users TO grafana_ro;
