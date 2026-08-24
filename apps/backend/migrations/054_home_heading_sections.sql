-- Editable headings for the home hero, age groups, testimonials and partners.
--
-- content is '<p></p>': listPublicSections only returns rows whose content is
-- non-empty, so a title-only row would never reach the page.
--
-- The hero and testimonial headings currently break across two lines with a
-- <br/>. An override renders as plain text, so editing either collapses it to
-- one line — the seeded titles are written accordingly.
--
-- Additive; 001-053 untouched.

INSERT INTO page_content_sections
  (page_id, section_key, title, content, is_visible, sort_order, published_at, created_at, updated_at)
SELECT p.id, s.key, s.label, '<p></p>', TRUE, s.ord, NOW(), NOW(), NOW()
  FROM pages p
 CROSS JOIN (VALUES
   ('home-hero',         'Welcome to Little Smarties Nursery',    2),
   ('home-age-groups',   'Our Age Groups',                        3),
   ('home-testimonials', 'Our Parents Are Our True Ambassadors!', 4),
   ('home-partners',     'Our Partners',                          5)
 ) AS s(key, label, ord)
 WHERE p.slug = 'home'
   AND p.deleted_at IS NULL
ON CONFLICT (page_id, section_key) WHERE deleted_at IS NULL DO NOTHING;
