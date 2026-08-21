-- Gives the Register page a row so its copy can be edited.
--
-- /register was the only public page with no entry in `pages`, so it had
-- nothing for page_content_sections to hang off and no override path at all —
-- every word on the enrolment page needed a developer. 024 did the same thing
-- for /booking for the same reason.
--
-- sort_order 10 continues from booking's 9.
--
-- Additive; 001-047 untouched.

INSERT INTO pages (title, slug, path, description, status, sort_order) VALUES
  ('Register', 'register', '/register', 'Enrolment form and what families need to bring.', 'published', 10)
ON CONFLICT (slug) WHERE deleted_at IS NULL DO NOTHING;

-- The same intro/body pair every other public page was given in 024.
INSERT INTO page_content_sections (page_id, section_key, title, content, is_visible, sort_order)
SELECT p.id, s.key, p.title || ' — ' || s.label, NULL, TRUE, s.ord
  FROM pages p
 CROSS JOIN (VALUES ('intro', 'Intro', 0), ('body', 'Main Content', 1)) AS s(key, label, ord)
 WHERE p.deleted_at IS NULL
   AND p.slug = 'register'
ON CONFLICT (page_id, section_key) WHERE deleted_at IS NULL DO NOTHING;
