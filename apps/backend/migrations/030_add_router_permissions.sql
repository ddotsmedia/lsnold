-- Permissions for the remaining admin routers.
--
-- Numbered 030, the next free one — 029 was the last applied and no 030 exists.
--
-- Two names from the brief are deliberately absent:
--   upload:media  — 029 already has edit:media, which is what uploading is.
--                   Two names for one action is how a permission ends up
--                   granted in one place and checked in the other.
--   the users and dashboard permissions — 029 created them already; the inserts
--                   below would be no-ops.
--
-- Roles are rebuilt rather than only added to, so this file states the whole
-- matrix and re-running it converges instead of accumulating. The admin role is
-- untouched: migration 029's trigger grants it everything on insert, including
-- every permission added here.
--
-- Additive; 001-029 untouched.

INSERT INTO permissions (name, description) VALUES
  ('delete:bookings',      'Delete tour bookings'),
  ('delete:media',         'Delete media from the library'),

  ('view:registrations',   'View registrations'),
  ('edit:registrations',   'Change the status of a registration'),
  ('delete:registrations', 'Delete registrations'),

  ('view:testimonials',    'View testimonials'),
  ('create:testimonials',  'Add testimonials'),
  ('edit:testimonials',    'Edit testimonials'),
  ('delete:testimonials',  'Delete testimonials'),

  ('view:analytics',       'View analytics and reports'),

  ('view:facilities',      'View facilities'),
  ('create:facilities',    'Add facilities'),
  ('edit:facilities',      'Edit facilities'),
  ('delete:facilities',    'Delete facilities'),

  ('view:partners',        'View partners'),
  ('create:partners',      'Add partners'),
  ('edit:partners',        'Edit partners'),
  ('delete:partners',      'Delete partners'),

  ('view:age-groups',      'View age groups and programmes'),
  ('edit:age-groups',      'Edit age groups and their images'),

  ('view:gallery',         'View the gallery'),
  ('manage:gallery',       'Add, edit and remove gallery images and videos'),

  ('view:news',            'View news and events'),
  ('create:news',          'Add news and events'),
  ('edit:news',            'Edit news and events'),
  ('delete:news',          'Delete news and events'),

  ('view:videos',          'View YouTube videos'),
  ('manage:videos',        'Add and remove YouTube videos'),

  ('view:chatbot',         'View chatbot conversations'),
  ('manage:chatbot',       'Change chatbot answers and settings'),

  ('view:settings',        'View site settings, SEO and social links'),
  ('manage:settings',      'Change site settings, SEO and social links')
ON CONFLICT (name) DO NOTHING;

-- viewer: everything named view:*, and nothing else. Rebuilt so a permission
-- added above is picked up and nothing else lingers.
DELETE FROM role_permissions
 WHERE role_id = (SELECT id FROM roles WHERE name = 'viewer');
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
 WHERE r.name = 'viewer' AND p.name LIKE 'view:%'
ON CONFLICT DO NOTHING;

-- editor: everything a viewer sees, plus creating and editing content and
-- publishing it. No deletes, and nothing named manage:* — those cover the
-- settings, the chatbot's answers and the permission matrix itself.
DELETE FROM role_permissions
 WHERE role_id = (SELECT id FROM roles WHERE name = 'editor');
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
 WHERE r.name = 'editor'
   AND (
     p.name LIKE 'view:%'
     OR p.name LIKE 'create:%'
     OR p.name LIKE 'edit:%'
     OR p.name = 'publish:pages'
     OR p.name = 'manage:gallery'
   )
   -- An editor manages content, not the people who manage content.
   AND p.name NOT IN ('create:users', 'edit:users')
ON CONFLICT DO NOTHING;

-- admin keeps everything; 029's trigger already granted the new rows above.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p WHERE r.name = 'admin'
ON CONFLICT DO NOTHING;
