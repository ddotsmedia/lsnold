-- Editable headings for the booking hero, form and benefits blocks.
--
-- content is '<p></p>': listPublicSections only returns rows whose content is
-- non-empty, so a title-only row would never reach the page.
--
-- The "Why Tour Little Smarties?" heading is not here — it is already wired to
-- the intro section.
--
-- Additive; 001-054 untouched.

INSERT INTO page_content_sections
  (page_id, section_key, title, content, is_visible, sort_order, published_at, created_at, updated_at)
SELECT p.id, s.key, s.label, '<p></p>', TRUE, s.ord, NOW(), NOW(), NOW()
  FROM pages p
 CROSS JOIN (VALUES
   ('booking-hero',         'Schedule a Tour',                  2),
   ('booking-form-heading', 'Tour booking form',                3),
   ('booking-benefits',     'Why Parents Love Little Smarties', 4)
 ) AS s(key, label, ord)
 WHERE p.slug = 'booking'
   AND p.deleted_at IS NULL
ON CONFLICT (page_id, section_key) WHERE deleted_at IS NULL DO NOTHING;
