-- The last four headings on the About / Nursery page: team, impact,
-- testimonials and the closing CTA.
--
-- content is '<p></p>': listPublicSections only returns rows whose content is
-- non-empty, so a title-only row would never reach the page.
--
-- sort_order starts at 19; 049 already used 10-18 on this page.
--
-- Additive; 001-058 untouched.

INSERT INTO page_content_sections
  (page_id, section_key, title, content, is_visible, sort_order, published_at, created_at, updated_at)
SELECT p.id, s.key, s.label, '<p></p>', TRUE, s.ord, NOW(), NOW(), NOW()
  FROM pages p
 CROSS JOIN (VALUES
   ('nursery-team',         'Meet Our Team',                            19),
   ('nursery-impact',       'Our Impact',                               20),
   ('nursery-testimonials', 'What Parents Say',                         21),
   ('nursery-cta',          'Ready to give your child the best start?', 22)
 ) AS s(key, label, ord)
 WHERE p.slug = 'about'
   AND p.deleted_at IS NULL
ON CONFLICT (page_id, section_key) WHERE deleted_at IS NULL DO NOTHING;
