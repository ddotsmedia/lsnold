-- Role-based access control for the admin panel.
--
-- Keyed on the EXISTING users.role column, not a new users.role_id.
--
-- users.role already exists and is already the thing that decides access:
-- middleware/auth.ts sets req.isAdmin from `role = 'admin' AND is_active`. A
-- second role_id column would mean two sources of truth for the same question,
-- and the failure is not cosmetic — a user set to role_id = viewer would still
-- carry role = 'admin', pass the requireAdmin gate, and never reach a
-- permission check. The permission system would look enforced and not be.
--
-- So roles.name matches users.role, and the join runs through it. Both existing
-- users are role = 'admin', so they pick up every permission the moment this
-- lands, with no backfill and no window where anyone is locked out.
--
-- Additive; 001-028 untouched.

CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- The lookup on every guarded request is "these permissions, for this role".
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_id);

INSERT INTO roles (name, description) VALUES
  ('viewer', 'Can view the admin panel and its content, read-only'),
  ('editor', 'Can create, edit, delete and publish content, and manage bookings'),
  ('admin',  'Full access, including users, roles and permissions')
ON CONFLICT (name) DO NOTHING;

INSERT INTO permissions (name, description) VALUES
  ('view:dashboard',     'View admin dashboard'),
  ('view:pages',         'View pages and their content'),
  ('create:pages',       'Create pages and content sections'),
  ('edit:pages',         'Edit pages and content sections'),
  ('delete:pages',       'Delete pages and content sections'),
  ('publish:pages',      'Publish, schedule and unpublish content'),
  ('view:media',         'View the media library'),
  ('edit:media',         'Upload and remove media'),
  ('view:bookings',      'View registrations and tour bookings'),
  ('edit:bookings',      'Change the status of a booking'),
  ('view:users',         'View admin users'),
  ('create:users',       'Create admin users'),
  ('edit:users',         'Edit admin users'),
  ('delete:users',       'Delete admin users'),
  ('manage:permissions', 'Change what each role may do')
ON CONFLICT (name) DO NOTHING;

-- viewer: everything named view:*, and nothing else.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
 WHERE r.name = 'viewer' AND p.name LIKE 'view:%'
ON CONFLICT DO NOTHING;

-- editor: content and bookings, but not users or permissions.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
 WHERE r.name = 'editor'
   AND p.name IN (
     'view:dashboard', 'view:pages', 'create:pages', 'edit:pages',
     'delete:pages', 'publish:pages', 'view:media', 'edit:media',
     'view:bookings', 'edit:bookings'
   )
ON CONFLICT DO NOTHING;

-- admin: everything, including anything added later — see the note below.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p WHERE r.name = 'admin'
ON CONFLICT DO NOTHING;

-- A permission added by a later migration would otherwise be granted to nobody,
-- including admin, until someone remembered to tick it. This makes that
-- automatic, and is safe to re-run.
CREATE OR REPLACE FUNCTION grant_new_permission_to_admin() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO role_permissions (role_id, permission_id)
  SELECT r.id, NEW.id FROM roles r WHERE r.name = 'admin'
  ON CONFLICT DO NOTHING;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS permissions_grant_admin ON permissions;
CREATE TRIGGER permissions_grant_admin AFTER INSERT ON permissions
FOR EACH ROW EXECUTE FUNCTION grant_new_permission_to_admin();
