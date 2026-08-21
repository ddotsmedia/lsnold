-- The team shown on the About / Nursery page, editable in the admin panel.
--
-- Seeded from the six members currently hardcoded as TEAM in
-- app/nursery/page.tsx. The source calls the field `position`; it is `role`
-- here to match the brief, and the page maps one to the other.
--
-- Same guarded seed as 046: the primary key is a generated UUID, so
-- ON CONFLICT has no target to match and a re-run would duplicate every row.
--
-- photo_url is nullable and none of the seeded members has one — the page
-- currently renders initials in a coloured circle, and keeps doing that until
-- a photo is chosen in the admin panel.
--
-- Additive; 001-046 untouched.

CREATE TABLE IF NOT EXISTS staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  role VARCHAR(100),
  bio TEXT,
  photo_url VARCHAR(500),
  display_order INTEGER NOT NULL DEFAULT 0,
  published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMP,
  CONSTRAINT staff_name_not_blank CHECK (btrim(name) <> '')
);

CREATE INDEX IF NOT EXISTS idx_staff_display_order ON staff(display_order) WHERE deleted_at IS NULL;

INSERT INTO staff (name, role, bio, display_order)
SELECT * FROM (VALUES
  ('Sarah Ahmed', 'Director',
   '20+ years in early childhood education and program development. Former education advisor. Passionate about creating inclusive learning environments.', 1),
  ('Fatima Khan', 'Head Teacher - Infants',
   '15+ years working with infants and toddlers. Specialized training in developmental psychology. Dedicated to responsive caregiving.', 2),
  ('Aisha Mohammed', 'Head Teacher - Toddlers',
   '12+ years in toddler care and early learning. Certified in Montessori and Reggio Emilia approaches.', 3),
  ('Layla Hassan', 'Head Teacher - Preschool',
   '10+ years in preschool education. Specialist in curriculum development and art therapy.', 4),
  ('Maryam Ibrahim', 'Support Staff & Activities Coordinator',
   '8+ years supporting children''s activities and special programs. Background in music and dance therapy.', 5),
  ('Zainab Ali', 'Nutritionist & Wellness Coordinator',
   'Registered dietitian with 6+ years in pediatric nutrition. Ensures all meals meet health and safety standards.', 6)
) AS seed(name, role, bio, display_order)
WHERE NOT EXISTS (SELECT 1 FROM staff);
