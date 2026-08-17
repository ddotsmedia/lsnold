-- Clears the placeholder section headings.
--
-- Numbered 038, the next free one — 037 was the last applied.
--
-- No heading column is added. page_content_sections.title already exists and is
-- already the heading: the admin editor's "Heading" field writes it, the public
-- renderer prints it as an <h2>, and the editor's preview shows it. A second
-- column would be two names for one thing, and the pair would drift the first
-- time something wrote one and not the other.
--
-- What is wrong is the contents. Migration 024 seeded every title with a label
-- for the admin list — 'Home — Intro', 'Book a Tour — Main Content' — but the
-- public page renders that same column as a heading. The sections are all still
-- drafts, so nobody has seen it; the first person to publish one would have got
--
--     ## Home — Intro
--     Little Smarties Nursery was founded in 2007...
--
-- on the live site. Clearing them makes a heading something an admin types when
-- they want one, and publishing shows the text alone until they do.
--
-- Only the seeded labels are cleared. Anything already edited is left alone.
--
-- Additive; 001-037 untouched.

UPDATE page_content_sections s
   SET title = NULL,
       updated_at = NOW()
  FROM pages p
 WHERE s.page_id = p.id
   AND s.deleted_at IS NULL
   AND s.title IN (p.title || ' — Intro', p.title || ' — Main Content');
