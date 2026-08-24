-- Editable headings for the Events page hero and the upcoming-events block.
--
-- page_id is the News & Events page, verified against production:
--   6d2ccafa-e9e7-459f-8d31-49cec7812cde
-- Matched on the slug rather than the literal so this also works against a
-- database rebuilt from baseline, where the id differs.
--
-- content is '<p></p>' because listPublicSections only returns a section whose
-- content is non-empty — a heading-only row would never reach the page.
--
-- Additive; 001-050 untouched.

INSERT INTO page_content_sections
  (page_id, section_key, title, content, is_visible, sort_order, published_at, created_at, updated_at)
SELECT p.id, s.key, s.label, '<p></p>', TRUE, s.ord, NOW(), NOW(), NOW()
  FROM pages p
 CROSS JOIN (VALUES
   ('events-programs-hero', 'Events & Programs', 2),
   ('events-upcoming',      'Upcoming Events',   3)
 ) AS s(key, label, ord)
 WHERE p.slug = 'news-events'
   AND p.deleted_at IS NULL
ON CONFLICT (page_id, section_key) WHERE deleted_at IS NULL DO NOTHING;
