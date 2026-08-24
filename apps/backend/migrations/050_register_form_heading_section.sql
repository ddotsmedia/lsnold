-- An editable heading above the registration form.
--
-- Numbered 050, the next free one — 049 was the last applied. The brief said
-- 052; there is no 050 or 051.
--
-- Placed in apps/backend/migrations, which is where this project's migrations
-- live and what infra/scripts/deploy.sh applies. There is no db/migrations
-- directory.
--
-- page_id is the Register page, verified against production:
--   6ad142a8-249a-4258-984c-20dd579f8987
-- Written as a subquery on the slug rather than the literal, so the file also
-- works against a database rebuilt from baseline, where the id differs.
--
-- content is '<p></p>' because listPublicSections only returns a section whose
-- content is non-empty — a heading-only row would never reach the page. The
-- empty paragraph is what makes the row deliverable so its title can render.
--
-- Additive; 001-049 untouched.

INSERT INTO page_content_sections
  (page_id, section_key, title, content, is_visible, sort_order, published_at, created_at, updated_at)
SELECT p.id, 'register-form-heading', 'Registration form', '<p></p>', TRUE, 2, NOW(), NOW(), NOW()
  FROM pages p
 WHERE p.slug = 'register'
   AND p.deleted_at IS NULL
ON CONFLICT (page_id, section_key) WHERE deleted_at IS NULL DO NOTHING;
