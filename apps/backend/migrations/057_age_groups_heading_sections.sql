-- Editable headings for the age-groups hero and the four static detail-panel
-- headings.
--
-- content is '<p></p>': listPublicSections only returns rows whose content is
-- non-empty, so a title-only row would never reach the page.
--
-- Not included: "A Day in {name}" and "Inside {name}" interpolate the selected
-- group, and an override is a static string, so editing either would drop the
-- name. The detail heading renders the group name straight from the database.
--
-- Additive; 001-056 untouched.

INSERT INTO page_content_sections
  (page_id, section_key, title, content, is_visible, sort_order, published_at, created_at, updated_at)
SELECT p.id, s.key, s.label, '<p></p>', TRUE, s.ord, NOW(), NOW(), NOW()
  FROM pages p
 CROSS JOIN (VALUES
   ('age-groups-hero',        'Our Age Groups',    2),
   ('age-groups-focus',       'Focus Areas',       3),
   ('age-groups-activities',  'Sample Activities', 4),
   ('age-groups-approach',    'Our Approach',      5),
   ('age-groups-quick-facts', 'Quick Facts',       6)
 ) AS s(key, label, ord)
 WHERE p.slug = 'age-groups'
   AND p.deleted_at IS NULL
ON CONFLICT (page_id, section_key) WHERE deleted_at IS NULL DO NOTHING;
