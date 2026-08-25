-- The four Quick Facts each age group shows: caregiver ratio, class size,
-- hours and enrichment.
--
-- All VARCHAR, not numeric. Every live value is prose — "1:12 (1 caregiver per
-- 12 children)", "Max 24 children", "Full day care" — and the ratio in
-- particular is a regulated figure families read as written. Storing 12 and
-- rebuilding the sentence would change what the page says.
--
-- Seeded from the constants the page renders today, matched on slug. Guarded
-- on IS NULL so a re-run cannot overwrite a corrected value.
--
-- Age ranges are deliberately untouched: Fuzzy Foxes and Cuddly Camels are
-- both 48-60 months, which looks wrong, but the correct bracket for Camels is
-- not something to guess at on a published page.
--
-- Additive; 001-060 untouched.

ALTER TABLE age_groups
  ADD COLUMN IF NOT EXISTS caregiver_ratio VARCHAR(120),
  ADD COLUMN IF NOT EXISTS class_size      VARCHAR(120),
  ADD COLUMN IF NOT EXISTS focus_hours     VARCHAR(120),
  ADD COLUMN IF NOT EXISTS enrichment      VARCHAR(255);

UPDATE age_groups AS a
   SET caregiver_ratio = COALESCE(a.caregiver_ratio, s.ratio),
       class_size      = COALESCE(a.class_size,      s.size),
       focus_hours     = COALESCE(a.focus_hours,     s.hours),
       enrichment      = COALESCE(a.enrichment,      s.enrichment),
       updated_at      = CURRENT_TIMESTAMP
  FROM (VALUES
    ('bouncing-bunnies',  '1:3 (1 caregiver per 3 babies)',      'Max 9 babies',
     'Full day care', 'Music, sensory play, tummy time'),
    ('precious-pandas',   '1:5 (1 caregiver per 5 toddlers)',    'Max 15 toddlers',
     'Full day care', 'Music, movement, art, sensory exploration'),
    ('gentle-giraffes',   '1:8 (1 caregiver per 8 children)',    'Max 16 children',
     'Full day care', 'Art, music, drama, nature exploration'),
    ('dazzling-dolphins', '1:10 (1 caregiver per 10 children)',  'Max 20 children',
     'Full day care', 'Sports, science, art, music, theater'),
    ('fuzzy-foxes',       '1:12 (1 caregiver per 12 children)',  'Max 24 children',
     'Full day care', 'Advanced academics, sports, arts, leadership'),
    ('cuddly-camels',     '1:12 (1 caregiver per 12 children)',  'Max 24 children',
     'Full day care', 'Advanced academics, projects, leadership, special classes')
  ) AS s(slug, ratio, size, hours, enrichment)
 WHERE a.slug = s.slug
   AND a.deleted_at IS NULL
   -- Only rows still missing all four, so a re-run is a no-op.
   AND a.caregiver_ratio IS NULL;
