-- Full-text search across the admin panel.
--
-- Numbered 037, the next free one — 036 was the last applied.
--
-- Postgres rather than Elasticsearch. The whole searchable set is 79 rows:
-- 40 media, 16 content sections, 12 events, 9 pages, 2 users, and no bookings
-- or registrations yet. A single-node Elasticsearch needs one to two gigabytes
-- resident for the JVM, on a host with 688 MB free and twenty-one containers
-- belonging to a dozen other projects. Trigram indexes answer the same
-- questions here in single-digit milliseconds and add nothing to run.
--
-- pg_trgm also gives what a LIKE cannot: 'ayshah' still finds 'Aysha', and
-- results can be ordered by how close the match is.
--
-- Additive; 001-036 untouched.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Each index covers exactly the columns the search reads for that type.
-- gin_trgm_ops serves both ILIKE '%x%' and similarity ordering.

CREATE INDEX IF NOT EXISTS idx_search_registrations
  ON registrations USING gin (
    (coalesce(child_name, '') || ' ' || coalesce(parent_name, '') || ' '
     || coalesce(parent_email, '') || ' ' || coalesce(parent_phone, '')) gin_trgm_ops
  );

CREATE INDEX IF NOT EXISTS idx_search_tour_bookings
  ON tour_bookings USING gin (
    (coalesce(visitor_name, '') || ' ' || coalesce(visitor_email, '') || ' '
     || coalesce(visitor_phone, '')) gin_trgm_ops
  );

CREATE INDEX IF NOT EXISTS idx_search_pages
  ON pages USING gin (
    (coalesce(title, '') || ' ' || coalesce(slug, '')) gin_trgm_ops
  );

CREATE INDEX IF NOT EXISTS idx_search_users
  ON users USING gin (
    (coalesce(name, '') || ' ' || coalesce(email, '')) gin_trgm_ops
  );

CREATE INDEX IF NOT EXISTS idx_search_news_events
  ON news_events USING gin (
    (coalesce(title, '') || ' ' || coalesce(description, '') || ' '
     || coalesce(location, '')) gin_trgm_ops
  );

-- Section bodies are HTML. Searching the raw markup would match on tag names,
-- so the tags are stripped in the expression the index is built on and in the
-- query, which must match exactly for the index to be used.
CREATE INDEX IF NOT EXISTS idx_search_page_sections
  ON page_content_sections USING gin (
    (coalesce(title, '') || ' ' || regexp_replace(coalesce(content, ''), '<[^>]*>', ' ', 'g')) gin_trgm_ops
  );

CREATE INDEX IF NOT EXISTS idx_search_media
  ON media USING gin (
    (coalesce(title, '') || ' ' || coalesce(alt_text, '')) gin_trgm_ops
  );
