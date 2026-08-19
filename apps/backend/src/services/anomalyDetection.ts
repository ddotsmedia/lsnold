import type { Pool } from 'pg';
import { emitToRoom } from '../realtime.js';

/**
 * Notices days that do not look like the days before them.
 *
 * Not a z-score. A mean-and-standard-deviation test needs a baseline with real
 * spread, and these counts do not have one: with thirty days of no bookings the
 * standard deviation is zero and every score is NaN or Infinity, and once a
 * single booking exists the next one scores above five — so the nursery's first
 * few bookings would each arrive as a critical alert. That is worse than no
 * detector, because it teaches people to dismiss the alert before it has ever
 * been right.
 *
 * Instead: the median and the median absolute deviation, which a single unusual
 * day cannot drag, plus three guards that must all pass before anything is
 * recorded. Below those, the honest answer is that there is not enough history
 * to say, and the job says so rather than inventing a finding.
 */

/** Days of history required before any judgement is made. */
const MIN_HISTORY_DAYS = 14;

/**
 * The baseline must reach this before a day can be called unusual.
 *
 * Under about three a day, ordinary variation and a genuine change look
 * identical — one family booking twice is a doubling.
 */
const MIN_BASELINE = 3;

/** And the day must differ by at least this many, so 0 to 2 is never an alert. */
const MIN_ABSOLUTE_DIFFERENCE = 3;

/** Distance from the median, in MADs, before a day counts as unusual. */
const SCORE_THRESHOLD = 3.5;

/** 1.4826 makes the MAD comparable to a standard deviation for normal data. */
const MAD_SCALE = 1.4826;

export interface MetricSpec {
  name: string;
  /** Must return one row per day: (day date, count int). */
  sql: string;
}

/**
 * Every metric worth watching, and only ones the database can answer.
 *
 * Traffic is included because it is the one with real history today; the two
 * submission metrics will start reporting once the nursery is taking bookings,
 * and until then they return "not enough history" rather than a false calm.
 */
export const METRICS: MetricSpec[] = [
  {
    name: 'daily_bookings',
    sql: `SELECT created_at::date AS day, COUNT(*)::int AS count
            FROM tour_bookings
           WHERE deleted_at IS NULL AND created_at > NOW() - INTERVAL '60 days'
           GROUP BY 1`,
  },
  {
    name: 'daily_registrations',
    sql: `SELECT created_at::date AS day, COUNT(*)::int AS count
            FROM registrations
           WHERE deleted_at IS NULL AND created_at > NOW() - INTERVAL '60 days'
           GROUP BY 1`,
  },
  {
    name: 'daily_page_views',
    sql: `SELECT created_at::date AS day, COUNT(*)::int AS count
            FROM page_analytics
           WHERE created_at > NOW() - INTERVAL '60 days'
           GROUP BY 1`,
  },
];

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : (sorted[mid] ?? 0);
}

export type Verdict =
  | { metric: string; status: 'insufficient_history'; days: number }
  | { metric: string; status: 'baseline_too_low'; baseline: number }
  | { metric: string; status: 'normal'; baseline: number; actual: number; score: number }
  | {
      metric: string; status: 'anomaly';
      observedOn: string; baseline: number; actual: number;
      score: number; direction: 'above' | 'below';
      severity: 'low' | 'medium' | 'high'; sampleDays: number;
    };

/**
 * Judges yesterday, not today.
 *
 * A day still in progress is always below its own baseline, so running against
 * today would report a shortfall every morning until the day caught up.
 */
export async function judgeMetric(db: Pool, metric: MetricSpec): Promise<Verdict> {
  const result = await db.query(metric.sql);
  const byDay = new Map<string, number>();
  for (const row of result.rows as Array<{ day: Date | string; count: number }>) {
    byDay.set(String(row.day).slice(0, 10), Number(row.count));
  }

  // Days with no rows are real zeroes, not gaps, so the series is built from
  // the calendar rather than from whatever the query happened to return.
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const observedOn = yesterday.toISOString().slice(0, 10);

  const history: number[] = [];
  for (let back = 2; back <= 60; back++) {
    const d = new Date();
    d.setDate(d.getDate() - back);
    history.push(byDay.get(d.toISOString().slice(0, 10)) ?? 0);
  }
  const actual = byDay.get(observedOn) ?? 0;

  if (history.length < MIN_HISTORY_DAYS) {
    return { metric: metric.name, status: 'insufficient_history', days: history.length };
  }

  const sorted = [...history].sort((a, b) => a - b);
  const baseline = median(sorted);

  if (baseline < MIN_BASELINE) {
    return { metric: metric.name, status: 'baseline_too_low', baseline };
  }

  const deviations = history.map((v) => Math.abs(v - baseline)).sort((a, b) => a - b);
  const mad = median(deviations) * MAD_SCALE;

  // A perfectly flat history has no spread to measure against; fall back to a
  // proportion of the baseline so a genuine jump is still caught.
  const spread = mad > 0 ? mad : Math.max(1, baseline * 0.5);

  const difference = actual - baseline;
  const score = Math.abs(difference) / spread;

  if (Math.abs(difference) < MIN_ABSOLUTE_DIFFERENCE || score < SCORE_THRESHOLD) {
    return {
      metric: metric.name, status: 'normal',
      baseline, actual, score: Math.round(score * 1000) / 1000,
    };
  }

  return {
    metric: metric.name,
    status: 'anomaly',
    observedOn,
    baseline,
    actual,
    score: Math.round(score * 1000) / 1000,
    direction: difference > 0 ? 'above' : 'below',
    severity: score >= 6 ? 'high' : score >= 4.5 ? 'medium' : 'low',
    sampleDays: history.length,
  };
}

/** Runs every metric, records what it finds, and tells anyone watching. */
export async function detectAnomalies(db: Pool): Promise<Verdict[]> {
  const verdicts: Verdict[] = [];

  for (const metric of METRICS) {
    try {
      const verdict = await judgeMetric(db, metric);
      verdicts.push(verdict);
      if (verdict.status !== 'anomaly') continue;

      // ON CONFLICT so a second run on the same day updates rather than
      // duplicating; the unique index makes that safe across instances too.
      const inserted = await db.query(
        `INSERT INTO anomalies
           (metric, observed_on, expected_value, actual_value, score,
            direction, severity, sample_days)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (metric, observed_on) DO UPDATE
            SET actual_value = EXCLUDED.actual_value,
                expected_value = EXCLUDED.expected_value,
                score = EXCLUDED.score,
                severity = EXCLUDED.severity
         RETURNING id, (xmax = 0) AS is_new`,
        [
          verdict.metric, verdict.observedOn, verdict.baseline, verdict.actual,
          verdict.score, verdict.direction, verdict.severity, verdict.sampleDays,
        ]
      );

      const row = inserted.rows[0] as { id: string; is_new: boolean } | undefined;
      // Only announce the first time. Re-running the job should not re-alert on
      // something an admin has already seen and possibly acknowledged.
      if (row?.is_new) {
        emitToRoom('activity', 'anomaly:detected', {
          id: row.id,
          metric: verdict.metric,
          observed_on: verdict.observedOn,
          expected: verdict.baseline,
          actual: verdict.actual,
          direction: verdict.direction,
          severity: verdict.severity,
        });
      }
    } catch (error) {
      // One bad metric must not stop the others being checked.
      console.error(`anomaly detection failed for ${metric.name}`, error);
    }
  }

  return verdicts;
}
