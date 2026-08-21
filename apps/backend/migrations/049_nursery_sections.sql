-- Section rows for the blocks on the Nursery page that just became editable.
--
-- The page reads usePageSections('about') — pages.slug is "about" where the
-- route is /nursery — so these hang off the About page alongside its existing
-- intro/body pair.
--
-- One row per block, not a `-title`/`-text` pair. listPublicSections only
-- returns a section whose content is non-empty, so a row carrying a heading and
-- no body would never reach the page and the heading would silently never
-- apply. Title overrides the block's heading, content its body.
--
-- content stays NULL: the copy lives in the component as the fallback, and
-- seeding a second copy here would leave two versions to drift apart. A NULL
-- row is invisible to the public endpoint and visible in the admin editor,
-- which is exactly what is wanted — the keys are discoverable without changing
-- anything on the live page.
--
-- title is seeded with the heading the block currently shows, so the editor
-- opens on the real wording rather than a blank box. That is safe for the same
-- reason: with no content the row is never delivered.
--
-- Additive; 001-048 untouched.

INSERT INTO page_content_sections (page_id, section_key, title, content, is_visible, sort_order)
SELECT p.id, s.key, s.label, NULL, TRUE, s.ord
  FROM pages p
 CROSS JOIN (VALUES
   ('nursery-hero',                  'Little Smarties Nursery',      10),
   ('nursery-what-we-stand-for',     'What We Stand For',            11),
   ('nursery-mission',               'Mission',                      12),
   ('nursery-vision',                'Vision',                       13),
   ('nursery-values',                'Values',                       14),
   ('nursery-philosophy',            'Our Educational Philosophy',   15),
   ('nursery-learning-through-play', 'Learning Through Play',        16),
   ('nursery-every-child',           'Every Child on Their Own Path', 17),
   ('nursery-family-partnership',    'A Partnership With Families',  18)
 ) AS s(key, label, ord)
 WHERE p.deleted_at IS NULL
   AND p.slug = 'about'
ON CONFLICT (page_id, section_key) WHERE deleted_at IS NULL DO NOTHING;
