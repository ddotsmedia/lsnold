-- Unusual days, once there is enough history to know what usual looks like.
--
-- Numbered 042, the next free one — 041 was the last applied.
--
-- Additive; 001-041 untouched.

CREATE TABLE IF NOT EXISTS anomalies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  /** e.g. daily_bookings, daily_registrations, daily_page_views. */
  metric VARCHAR(64) NOT NULL,
  /** The day being judged, not the moment of judging. */
  observed_on DATE NOT NULL,

  -- NUMERIC, not DECIMAL without precision: these are small counts and a
  -- rounded baseline would make a 2.4 look like a 2.
  expected_value NUMERIC(12,3) NOT NULL,
  actual_value   NUMERIC(12,3) NOT NULL,
  /** Robust score: distance from the median in median-absolute-deviations. */
  score          NUMERIC(12,3) NOT NULL,
  direction      VARCHAR(8) NOT NULL CHECK (direction IN ('above', 'below')),
  severity       VARCHAR(8) NOT NULL CHECK (severity IN ('low', 'medium', 'high')),

  /** How many days of history the judgement rested on. */
  sample_days INTEGER NOT NULL,

  acknowledged_at TIMESTAMP,
  acknowledged_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- One verdict per metric per day. The job is safe to run twice — a retry, a
-- second instance, a manual trigger — without filling the table with copies of
-- the same finding.
CREATE UNIQUE INDEX IF NOT EXISTS idx_anomalies_metric_day
  ON anomalies (metric, observed_on);

-- The explorer reads newest-first, and the dashboard asks for unacknowledged.
CREATE INDEX IF NOT EXISTS idx_anomalies_recent
  ON anomalies (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_anomalies_open
  ON anomalies (created_at DESC) WHERE acknowledged_at IS NULL;

COMMENT ON COLUMN anomalies.score IS
  'Distance from the median in MADs, not a standard z-score. Counts this small
   are dominated by single events, and a mean/stddev score reports the first
   booking a nursery ever takes as a critical anomaly.';
