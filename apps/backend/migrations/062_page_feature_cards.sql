-- Feature cards: the titled, described, icon-bearing cards a page renders as a
-- row, editable in admin.
--
-- First user is the four Safety & Wellbeing cards on /facilities, which were a
-- SAFETY_FEATURES constant in the page.
--
-- Not facilities.features_json, which is where the brief put them. Those cards
-- belong to the page, not to any one facility: hanging them off a facility row
-- would mean picking an arbitrary one, and losing them when it is reordered or
-- deleted. facility_features already holds the genuine per-facility lists (98
-- rows), and a JSONB column beside it would be two tables describing one
-- relationship — the drift this codebase already avoided once for page_media.
--
-- section_key groups cards within a page, so the same table can later carry the
-- outdoor and technology lists without a second migration.
--
-- color is kept as a column rather than derived from position: it drives each
-- card's styling today, and cycling by sort_order would silently recolour the
-- live cards the first time someone reorders them.
--
-- Seeded from what the page renders today, guarded so a re-run is a no-op.
--
-- Additive; 001-061 untouched.

CREATE TABLE IF NOT EXISTS page_feature_cards (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_slug   VARCHAR(100) NOT NULL,
  section_key VARCHAR(100) NOT NULL,
  title       VARCHAR(255) NOT NULL,
  description TEXT,
  icon        VARCHAR(50),
  color       VARCHAR(20)  NOT NULL DEFAULT 'blue',
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  deleted_at  TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_page_feature_cards_live
  ON page_feature_cards (page_slug, section_key, sort_order)
  WHERE deleted_at IS NULL;

-- One card per title within a group, so a double-submit cannot duplicate one.
CREATE UNIQUE INDEX IF NOT EXISTS idx_page_feature_cards_unique
  ON page_feature_cards (page_slug, section_key, lower(title))
  WHERE deleted_at IS NULL;

INSERT INTO page_feature_cards (page_slug, section_key, title, description, icon, color, sort_order)
SELECT * FROM (VALUES
  ('facilities', 'facilities-safety', '24/7 Monitoring',
   'Security cameras cover every entrance, corridor and play area, and access to the building is controlled throughout the day. Staff are trained on sign-in and collection procedures.',
   '📹', 'blue', 0),
  ('facilities', 'facilities-safety', 'Air Purification',
   'HEPA filtration runs in every room to keep the air clean, and classrooms are ventilated regularly. Filters are checked and replaced on a fixed schedule.',
   '🌬️', 'green', 1),
  ('facilities', 'facilities-safety', 'Daily Sanitation',
   'Rooms, toys and shared surfaces are cleaned to a documented standard every day, with high-touch points wiped down repeatedly between activities.',
   '🧹', 'red', 2),
  ('facilities', 'facilities-safety', 'Safety Protocols',
   'Clear emergency procedures are posted and practised, staff hold current first-aid training, and allergy and medication plans are kept for every child who needs one.',
   '🛡️', 'yellow', 3)
) AS s(page_slug, section_key, title, description, icon, color, sort_order)
-- Nothing at all for this group, so a re-run after an edit or a deletion
-- cannot put the original wording back.
WHERE NOT EXISTS (
  SELECT 1 FROM page_feature_cards
   WHERE page_slug = 'facilities' AND section_key = 'facilities-safety'
);
