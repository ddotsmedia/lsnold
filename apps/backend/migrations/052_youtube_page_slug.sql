-- Assigns a YouTube video to a public page.
--
-- Numbered 052, the next free one — 051 was the last applied.
--
-- NULL means unassigned, so every existing row keeps behaving as it did and
-- nothing appears anywhere new on rollout. The one video already published is
-- backfilled to 'home' explicitly rather than being read as home by default:
-- the home page is about to filter on this column, and a NULL treated as
-- "home" is a rule nobody would find again in six months.
--
-- Slugs are route names — 'home', 'nursery', 'facilities', 'age-groups' —
-- matching the keys the media and page-section hooks already use, not the
-- pages.slug spelling (which calls /nursery "about").
--
-- Additive; 001-051 untouched.

ALTER TABLE youtube_videos
  ADD COLUMN IF NOT EXISTS page_slug VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_youtube_videos_page_slug
  ON youtube_videos(page_slug) WHERE deleted_at IS NULL;

-- Backfill: the earliest live video becomes the home page's, which is the one
-- the home page already shows. Guarded on nothing being assigned yet, so a
-- re-run cannot reassign a video an admin has since moved.
UPDATE youtube_videos
   SET page_slug = 'home', updated_at = CURRENT_TIMESTAMP
 WHERE id = (
   SELECT id FROM youtube_videos
    WHERE deleted_at IS NULL
    ORDER BY display_order, created_at
    LIMIT 1
 )
   AND NOT EXISTS (
     SELECT 1 FROM youtube_videos WHERE page_slug IS NOT NULL AND deleted_at IS NULL
   );
