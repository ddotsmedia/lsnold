-- Editable headings for the facilities hero, intro, safety, outdoor,
-- technology and closing CTA blocks.
--
-- content is '<p></p>': listPublicSections only returns rows whose content is
-- non-empty, so a title-only row would never reach the page.
--
-- facilities-intro-heading, not facilities-intro: an `intro` section already
-- exists on this page and is a different block, so a near-identical key would
-- be easy to pick by mistake in the editor.
--
-- The "Safety & Hygiene Standards" title is stored as plain text; the page
-- writes it as &amp; because that is JSX source, not because the value is
-- escaped.
--
-- Additive; 001-057 untouched.

INSERT INTO page_content_sections
  (page_id, section_key, title, content, is_visible, sort_order, published_at, created_at, updated_at)
SELECT p.id, s.key, s.label, '<p></p>', TRUE, s.ord, NOW(), NOW(), NOW()
  FROM pages p
 CROSS JOIN (VALUES
   ('facilities-hero',          'Our State-of-the-Art Facilities',        2),
   ('facilities-intro-heading', 'World-Class Learning Environments',      3),
   ('facilities-safety',        'Safety & Hygiene Standards',             4),
   ('facilities-outdoor',       'Outdoor Play Areas',                     5),
   ('facilities-technology',    'Technology-Enhanced Learning',           6),
   ('facilities-cta',           'Ready to see our facilities in person?', 7)
 ) AS s(key, label, ord)
 WHERE p.slug = 'facilities'
   AND p.deleted_at IS NULL
ON CONFLICT (page_id, section_key) WHERE deleted_at IS NULL DO NOTHING;
