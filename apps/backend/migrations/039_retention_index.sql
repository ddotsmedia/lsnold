-- Indexes for retention and cohort analysis.
--
-- Numbered 039, the next free one — 038 was the last applied.
--
-- Both queries start by finding each visitor's first sighting, which is a
-- grouped scan of page_analytics by visitor_id. Without this it re-reads the
-- whole table for every bucket.
--
-- No column is added. visitor_id already exists; what changed is how it is
-- derived — the day is no longer part of the hash, so the same browser now
-- keeps one id across days and a return visit is detectable. Rows written
-- before that change keep their old per-day ids and cannot be linked, so both
-- reports measure from the deploy forward and say so.
--
-- Additive; 001-038 untouched.

CREATE INDEX IF NOT EXISTS idx_analytics_visitor_first_seen
  ON page_analytics (visitor_id, created_at);

-- Cohorts group by the month of first sighting.
CREATE INDEX IF NOT EXISTS idx_analytics_created_month
  ON page_analytics (date_trunc('month', created_at));
