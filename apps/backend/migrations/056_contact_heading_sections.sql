-- Editable headings for the contact hero, info cards, form, map, hours and FAQ.
--
-- content is '<p></p>': listPublicSections only returns rows whose content is
-- non-empty, so a title-only row would never reach the page.
--
-- sort_order starts at 3; body and intro already hold 1 and 2 on this page.
--
-- Additive; 001-055 untouched.

INSERT INTO page_content_sections
  (page_id, section_key, title, content, is_visible, sort_order, published_at, created_at, updated_at)
SELECT p.id, s.key, s.label, '<p></p>', TRUE, s.ord, NOW(), NOW(), NOW()
  FROM pages p
 CROSS JOIN (VALUES
   ('contact-hero',     'Get in Touch',               3),
   ('contact-info',     'Contact details',            4),
   ('contact-form',     'Send a message and find us', 5),
   ('contact-location', 'Our Location',               6),
   ('contact-hours',    'Office Hours',               7),
   ('contact-faq',      'Frequently Asked Questions', 8)
 ) AS s(key, label, ord)
 WHERE p.slug = 'contact'
   AND p.deleted_at IS NULL
ON CONFLICT (page_id, section_key) WHERE deleted_at IS NULL DO NOTHING;
