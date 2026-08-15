-- Scheduled publishing for page content sections.
--
-- Numbered 027, not the 025 in the brief: 025 is testimonials and 026 is the
-- events work. is_visible is not added either — migration 024 already created
-- it, and it keeps its meaning here (hide something without deleting it).
--
-- Model
-- -----
--   published_at NULL, scheduled_publish_at NULL  -> draft, never shown
--   published_at <= now()                         -> live
--   scheduled_publish_at > now()                  -> goes live at that moment
--
-- The public query tests COALESCE(published_at, scheduled_publish_at) <= NOW(),
-- so a scheduled section starts appearing on its own when the time passes. That
-- is deliberate: if liveness depended on a job running, a dead job would mean
-- content silently never publishing. The job in scripts/publishScheduledSections
-- then only tidies up — it moves the timestamp into published_at so the audit
-- column reads true — and the site behaves correctly whether or not it runs.
--
-- Additive; 001-026 untouched.

ALTER TABLE page_content_sections
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMP;
ALTER TABLE page_content_sections
  ADD COLUMN IF NOT EXISTS scheduled_publish_at TIMESTAMP;

-- A section cannot be scheduled for a moment before it was published; that
-- combination has no meaning and would only confuse the admin screen.
ALTER TABLE page_content_sections
  DROP CONSTRAINT IF EXISTS page_content_sections_schedule_after_publish;
ALTER TABLE page_content_sections
  ADD CONSTRAINT page_content_sections_schedule_after_publish
  CHECK (
    published_at IS NULL
    OR scheduled_publish_at IS NULL
    OR scheduled_publish_at >= published_at
  );

CREATE INDEX IF NOT EXISTS idx_sections_published_at
  ON page_content_sections(published_at);
CREATE INDEX IF NOT EXISTS idx_sections_scheduled_publish_at
  ON page_content_sections(scheduled_publish_at);

-- The public read is "this page, live now, in order".
CREATE INDEX IF NOT EXISTS idx_sections_public_live
  ON page_content_sections(page_id, sort_order)
  WHERE deleted_at IS NULL AND is_visible;

-- Anything already on the public site must stay there. Before this migration a
-- section was live if it was visible and had text; those rows are backdated to
-- when they were last edited so the new filter keeps them live. Sections that
-- were never written into stay drafts, which is what they already looked like.
UPDATE page_content_sections
   SET published_at = COALESCE(updated_at, created_at, NOW())
 WHERE deleted_at IS NULL
   AND is_visible = TRUE
   AND content IS NOT NULL
   AND btrim(content) <> ''
   AND published_at IS NULL;
