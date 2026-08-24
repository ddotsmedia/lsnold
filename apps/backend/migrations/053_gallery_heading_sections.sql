-- Editable headings for the gallery hero, photo grid and video list.
--
-- content is '<p></p>': listPublicSections only returns rows whose content is
-- non-empty, so a title-only row would never reach the page.
--
-- The featured-video and per-video headings are not here — they render
-- video.title from the database already.
--
-- Additive; 001-052 untouched.

INSERT INTO page_content_sections
  (page_id, section_key, title, content, is_visible, sort_order, published_at, created_at, updated_at)
SELECT p.id, s.key, s.label, '<p></p>', TRUE, s.ord, NOW(), NOW(), NOW()
  FROM pages p
 CROSS JOIN (VALUES
   ('gallery-hero',        'Gallery',       2),
   ('gallery-photos',      'Photo gallery', 3),
   ('gallery-more-videos', 'More Videos',   4)
 ) AS s(key, label, ord)
 WHERE p.slug = 'gallery'
   AND p.deleted_at IS NULL
ON CONFLICT (page_id, section_key) WHERE deleted_at IS NULL DO NOTHING;
