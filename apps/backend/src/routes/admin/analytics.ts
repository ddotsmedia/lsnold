import express from 'express';
import type { Response } from 'express';
import type { Pool } from 'pg';
import { authenticate, createResolveAdmin, requireAdmin } from '../../middleware/auth.js';
import { createResolvePermissions, requirePermission, requirePanelAccess } from '../../middleware/permissions.js';
import type { AuthRequest } from '../../middleware/auth.js';

// ======================== Analytics Endpoints ========================

async function getOverview(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [totalViews, uniqueVisitors, topPages, deviceBreakdown, referrers] = await Promise.all([
      db.query(
        'SELECT COUNT(*)::int as count FROM page_analytics WHERE created_at >= $1',
        [since]
      ),
      db.query(
        'SELECT COUNT(DISTINCT visitor_id)::int as count FROM page_analytics WHERE created_at >= $1 AND visitor_id IS NOT NULL',
        [since]
      ),
      db.query(
        `SELECT page_path, COUNT(*)::int as views, COUNT(DISTINCT visitor_id)::int as unique_visitors
         FROM page_analytics WHERE created_at >= $1
         GROUP BY page_path ORDER BY views DESC LIMIT 20`,
        [since]
      ),
      db.query(
        `SELECT COALESCE(device_type, 'unknown') as device_type, COUNT(*)::int as count
         FROM page_analytics WHERE created_at >= $1
         GROUP BY device_type ORDER BY count DESC`,
        [since]
      ),
      db.query(
        `SELECT COALESCE(referrer, 'direct') as referrer, COUNT(*)::int as count
         FROM page_analytics WHERE created_at >= $1 AND referrer IS NOT NULL AND referrer != ''
         GROUP BY referrer ORDER BY count DESC LIMIT 20`,
        [since]
      ),
    ]);

    res.json({
      period: { days, since: since.toISOString() },
      totalViews: totalViews.rows[0]?.count ?? 0,
      uniqueVisitors: uniqueVisitors.rows[0]?.count ?? 0,
      topPages: topPages.rows,
      deviceBreakdown: deviceBreakdown.rows,
      referrers: referrers.rows,
    });
  } catch (error) {
    console.error('getOverview failed', error);
    res.status(500).json({ error: 'Failed to fetch analytics overview' });
  }
}

async function getTimeSeries(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
    const since = new Date();
    since.setDate(since.getDate() - days);
    const granularity = req.query.granularity === 'hour' ? 'hour' : 'day';

    const truncFn = granularity === 'hour' ? "date_trunc('hour', created_at)" : "date_trunc('day', created_at)";

    const result = await db.query(
      `SELECT ${truncFn} as period,
              COUNT(*)::int as views,
              COUNT(DISTINCT visitor_id)::int as unique_visitors
       FROM page_analytics
       WHERE created_at >= $1
       GROUP BY period
       ORDER BY period ASC`,
      [since]
    );

    res.json({
      granularity,
      period: { days, since: since.toISOString() },
      data: result.rows,
    });
  } catch (error) {
    console.error('getTimeSeries failed', error);
    res.status(500).json({ error: 'Failed to fetch time series' });
  }
}

async function getBrowserStats(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
    const since = new Date();
    since.setDate(since.getDate() - days);

    const result = await db.query(
      `SELECT COALESCE(browser, 'unknown') as browser, COUNT(*)::int as count
       FROM page_analytics WHERE created_at >= $1
       GROUP BY browser ORDER BY count DESC LIMIT 15`,
      [since]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('getBrowserStats failed', error);
    res.status(500).json({ error: 'Failed to fetch browser stats' });
  }
}

async function getCountryStats(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
    const since = new Date();
    since.setDate(since.getDate() - days);

    const result = await db.query(
      `SELECT COALESCE(country, 'unknown') as country, COUNT(*)::int as count
       FROM page_analytics WHERE created_at >= $1
       GROUP BY country ORDER BY count DESC LIMIT 30`,
      [since]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('getCountryStats failed', error);
    res.status(500).json({ error: 'Failed to fetch country stats' });
  }
}

async function getPageDetail(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const pagePath = req.query.path as string;
    if (!pagePath) { res.status(400).json({ error: 'path query parameter required' }); return; }

    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [stats, timeSeries] = await Promise.all([
      db.query(
        `SELECT COUNT(*)::int as views,
                COUNT(DISTINCT visitor_id)::int as unique_visitors,
                AVG(session_duration)::int as avg_duration
         FROM page_analytics WHERE page_path = $1 AND created_at >= $2`,
        [pagePath, since]
      ),
      db.query(
        `SELECT date_trunc('day', created_at) as period,
                COUNT(*)::int as views
         FROM page_analytics WHERE page_path = $1 AND created_at >= $2
         GROUP BY period ORDER BY period ASC`,
        [pagePath, since]
      ),
    ]);

    res.json({
      page: pagePath,
      stats: stats.rows[0],
      timeSeries: timeSeries.rows,
    });
  } catch (error) {
    console.error('getPageDetail failed', error);
    res.status(500).json({ error: 'Failed to fetch page analytics' });
  }
}

// ======================== Public tracker endpoint (no auth) ========================

async function trackPageView(db: Pool, req: express.Request, res: Response): Promise<void> {
  try {
    const { page_path, visitor_id, referrer, session_duration } = req.body as Record<string, unknown>;

    if (!page_path || typeof page_path !== 'string') {
      res.status(400).json({ error: 'page_path required' });
      return;
    }

    // Parse user agent for device type and browser
    const ua = req.headers['user-agent'] || '';
    let deviceType = 'desktop';
    if (/mobile|android|iphone|ipod/i.test(ua)) deviceType = 'mobile';
    else if (/tablet|ipad/i.test(ua)) deviceType = 'tablet';

    let browser = 'other';
    if (/chrome/i.test(ua) && !/edge|opr/i.test(ua)) browser = 'Chrome';
    else if (/firefox/i.test(ua)) browser = 'Firefox';
    else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';
    else if (/edge/i.test(ua)) browser = 'Edge';
    else if (/opr|opera/i.test(ua)) browser = 'Opera';

    // Country from X-Forwarded-For or CF header (if behind Cloudflare)
    const country = (req.headers['cf-ipcountry'] as string) || null;

    await db.query(
      `INSERT INTO page_analytics (page_path, visitor_id, user_agent, referrer, country, device_type, browser, session_duration)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        page_path,
        visitor_id || null,
        ua,
        referrer || null,
        country,
        deviceType,
        browser,
        typeof session_duration === 'number' ? session_duration : null,
      ]
    );

    res.status(204).send();
  } catch (error) {
    console.error('trackPageView failed', error);
    // Analytics tracking should never return errors to the user
    res.status(204).send();
  }
}

/**
 * Daily registrations, plus a straight-line projection.
 *
 * Ordinary least squares over the daily counts. It is a trend line, not a
 * model: it knows nothing about term dates, holidays or marketing, so it is
 * labelled a projection everywhere it is shown.
 *
 * Below MIN_POINTS days of history it returns `insufficient_data` and no
 * projection at all. A regression through two points draws a confident line
 * that means nothing, and a dashboard that invents numbers is worse than one
 * that admits it has none — there are currently no registrations at all.
 */
const MIN_POINTS = 7;

async function getForecast(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const days = Math.min(365, Math.max(30, Number(req.query.days) || 90));
    const ahead = Math.min(90, Math.max(7, Number(req.query.ahead) || 30));

    const history = await db.query(
      `SELECT d::date AS day, COUNT(r.id)::int AS count
         FROM generate_series(CURRENT_DATE - ($1::int - 1), CURRENT_DATE, '1 day') AS d
         LEFT JOIN registrations r ON r.created_at::date = d::date
        GROUP BY d ORDER BY d`,
      [days]
    );

    const rows = history.rows as Array<{ day: Date; count: number }>;
    const series = rows.map((row) => ({
      date: row.day.toISOString().slice(0, 10),
      count: row.count,
    }));

    // Days that actually carry a registration, not calendar days: a long run of
    // zeroes is an absence of data, not evidence of a downward trend.
    const observed = series.filter((point) => point.count > 0).length;
    if (observed < MIN_POINTS) {
      res.json({
        history: series,
        forecast: [],
        status: 'insufficient_data',
        observed_days: observed,
        required_days: MIN_POINTS,
      });
      return;
    }

    const n = series.length;
    const meanX = (n - 1) / 2;
    const meanY = series.reduce((sum, p) => sum + p.count, 0) / n;
    let covariance = 0;
    let variance = 0;
    series.forEach((point, index) => {
      covariance += (index - meanX) * (point.count - meanY);
      variance += (index - meanX) ** 2;
    });
    const slope = variance === 0 ? 0 : covariance / variance;
    const intercept = meanY - slope * meanX;

    const lastDay = new Date(`${series[n - 1]!.date}T00:00:00Z`);
    const forecast = Array.from({ length: ahead }, (_, step) => {
      const date = new Date(lastDay);
      date.setUTCDate(date.getUTCDate() + step + 1);
      return {
        date: date.toISOString().slice(0, 10),
        // A projection of negative arrivals is not a thing.
        count: Math.max(0, Math.round((intercept + slope * (n + step)) * 10) / 10),
      };
    });

    res.json({
      history: series,
      forecast,
      status: 'ok',
      observed_days: observed,
      slope_per_day: Math.round(slope * 1000) / 1000,
    });
  } catch (error) {
    console.error('getForecast failed', error);
    res.status(500).json({ error: 'Failed to build forecast' });
  }
}

/** Visitors -> tour bookings -> registrations, with the drop at each step. */
async function getFunnel(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const days = Math.min(365, Math.max(7, Number(req.query.days) || 30));
    const since = `${days} days`;

    const [visitors, bookings, registrations] = await Promise.all([
      db.query(
        `SELECT COUNT(DISTINCT COALESCE(visitor_id, session_id))::int AS n
           FROM page_analytics WHERE created_at > NOW() - $1::interval`, [since]),
      db.query(
        `SELECT COUNT(*)::int AS n FROM tour_bookings
          WHERE created_at > NOW() - $1::interval`, [since]),
      db.query(
        `SELECT COUNT(*)::int AS n FROM registrations
          WHERE created_at > NOW() - $1::interval`, [since]),
    ]);

    const counts = [
      { stage: 'Visitors', count: (visitors.rows[0] as { n: number }).n },
      { stage: 'Tour bookings', count: (bookings.rows[0] as { n: number }).n },
      { stage: 'Registrations', count: (registrations.rows[0] as { n: number }).n },
    ];

    const stages = counts.map((entry, index) => {
      const previous = index === 0 ? entry.count : counts[index - 1]!.count;
      return {
        ...entry,
        // Rate against the step before, which is the number an admin acts on.
        // Null rather than 0 when the previous step is empty: no visitors means
        // the conversion is unknown, not nil.
        conversion: index === 0 ? 100 : previous === 0 ? null
          : Math.round((entry.count / previous) * 1000) / 10,
      };
    });

    res.json({ days, stages });
  } catch (error) {
    console.error('getFunnel failed', error);
    res.status(500).json({ error: 'Failed to build funnel' });
  }
}

/**
 * Visits by weekday and hour.
 *
 * NOT the class-capacity heatmap that was asked for: nothing in this database
 * records a class roll or a room capacity — age_groups has no capacity column
 * and there is no schedule or slot table — so that chart could only be drawn
 * from invented numbers. This uses the traffic that is actually recorded, and
 * answers a question the nursery can act on: when are families looking.
 */
async function getVisitHeatmap(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const days = Math.min(365, Math.max(7, Number(req.query.days) || 30));
    const result = await db.query(
      `SELECT EXTRACT(DOW FROM created_at)::int AS weekday,
              EXTRACT(HOUR FROM created_at)::int AS hour,
              COUNT(*)::int AS visits
         FROM page_analytics
        WHERE created_at > NOW() - ($1::text || ' days')::interval
        GROUP BY 1, 2`,
      [String(days)]
    );

    const cells = (result.rows as Array<{ weekday: number; hour: number; visits: number }>);
    const peak = cells.reduce((max, cell) => Math.max(max, cell.visits), 0);
    res.json({ days, peak, cells });
  } catch (error) {
    console.error('getVisitHeatmap failed', error);
    res.status(500).json({ error: 'Failed to build heatmap' });
  }
}

/**
 * Everything the dashboard shows, as sections a report can print.
 *
 * One request rather than the five the dashboard makes: a report is a single
 * moment, and figures gathered a second apart could disagree with each other
 * on a busy day.
 *
 * Lives here with the other analytics rather than in a new reports router.
 * The booking and registration exports already answer at their own tables'
 * /export, and a second set beside them would be two things to keep in step.
 */
async function getReport(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
    const since = `${days} days`;

    const [totals, pages, funnel, statuses] = await Promise.all([
      db.query(
        `SELECT
           (SELECT COUNT(*)::int FROM page_analytics WHERE created_at > NOW() - $1::interval) AS page_views,
           (SELECT COUNT(DISTINCT COALESCE(visitor_id, session_id))::int FROM page_analytics
             WHERE created_at > NOW() - $1::interval) AS visitors,
           (SELECT COUNT(*)::int FROM registrations
             WHERE created_at > NOW() - $1::interval AND deleted_at IS NULL) AS registrations,
           (SELECT COUNT(*)::int FROM tour_bookings
             WHERE created_at > NOW() - $1::interval AND deleted_at IS NULL) AS bookings`,
        [since]
      ),
      db.query(
        `SELECT page_path AS path, COUNT(*)::int AS views
           FROM page_analytics WHERE created_at > NOW() - $1::interval
          GROUP BY page_path ORDER BY views DESC LIMIT 15`,
        [since]
      ),
      db.query(
        `SELECT
           (SELECT COUNT(DISTINCT COALESCE(visitor_id, session_id))::int FROM page_analytics
             WHERE created_at > NOW() - $1::interval) AS visitors,
           (SELECT COUNT(*)::int FROM tour_bookings
             WHERE created_at > NOW() - $1::interval AND deleted_at IS NULL) AS bookings,
           (SELECT COUNT(*)::int FROM registrations
             WHERE created_at > NOW() - $1::interval AND deleted_at IS NULL) AS registrations`,
        [since]
      ),
      db.query(
        `SELECT 'Registrations' AS kind, status, COUNT(*)::int AS count
           FROM registrations WHERE deleted_at IS NULL GROUP BY status
         UNION ALL
         SELECT 'Tour bookings', status, COUNT(*)::int
           FROM tour_bookings WHERE deleted_at IS NULL GROUP BY status
         ORDER BY 1, 2`
      ),
    ]);

    const t = totals.rows[0] as Record<string, number>;
    const f = funnel.rows[0] as Record<string, number>;
    const rate = (part: number, whole: number) =>
      whole === 0 ? '—' : `${Math.round((part / whole) * 1000) / 10}%`;

    res.json({
      generated_at: new Date().toISOString(),
      days,
      sections: [
        {
          title: 'Summary',
          columns: [{ key: 'metric', header: 'Metric' }, { key: 'value', header: 'Value' }],
          rows: [
            { metric: 'Page views', value: t.page_views },
            { metric: 'Unique visitors', value: t.visitors },
            { metric: 'Tour bookings', value: t.bookings },
            { metric: 'Registrations', value: t.registrations },
          ],
        },
        {
          title: 'Visitors to registrations',
          columns: [
            { key: 'stage', header: 'Stage' },
            { key: 'count', header: 'Count' },
            { key: 'rate', header: 'From previous' },
          ],
          rows: [
            { stage: 'Visitors', count: f.visitors, rate: '100%' },
            { stage: 'Tour bookings', count: f.bookings, rate: rate(f.bookings ?? 0, f.visitors ?? 0) },
            { stage: 'Registrations', count: f.registrations, rate: rate(f.registrations ?? 0, f.bookings ?? 0) },
          ],
        },
        {
          title: 'Most visited pages',
          columns: [{ key: 'path', header: 'Page' }, { key: 'views', header: 'Views' }],
          rows: pages.rows,
        },
        {
          title: 'Status breakdown (all time)',
          columns: [
            { key: 'kind', header: 'Type' },
            { key: 'status', header: 'Status' },
            { key: 'count', header: 'Count' },
          ],
          rows: statuses.rows,
        },
      ],
    });
  } catch (error) {
    console.error('getReport failed', error);
    res.status(500).json({ error: 'Failed to build the report' });
  }
}

/**
 * The day visitor identity became stable across days.
 *
 * Before this, visitor_id was a hash that included the date, so the same
 * browser produced a new id every day and no return visit could ever be seen.
 * Rows written before the change cannot be linked to a later visit, so both
 * reports below count only from here and report the date so the screen can say
 * what the figures cover.
 */
async function measuringSince(db: Pool): Promise<string> {
  const result = await db.query(
    `SELECT MIN(created_at)::date AS since FROM page_analytics
      WHERE created_at >= $1::timestamp`,
    [RETENTION_EPOCH]
  );
  return String((result.rows[0] as { since: string | null }).since ?? RETENTION_EPOCH);
}

/** Set to the deploy that split visitor_id from session_id. */
const RETENTION_EPOCH = '2026-08-17';

/**
 * How many first-time visitors came back, by how long after.
 *
 * Buckets rather than a per-day curve: with this much traffic a daily series is
 * mostly zeroes, and the question being asked is "do people come back at all,
 * and how quickly", which buckets answer without implying precision.
 */
async function getRetention(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const days = Math.min(365, Math.max(7, Number(req.query.days) || 90));
    const since = await measuringSince(db);

    const result = await db.query(
      `WITH first_seen AS (
         SELECT visitor_id, MIN(created_at) AS started
           FROM page_analytics
          WHERE created_at >= $1::timestamp AND visitor_id IS NOT NULL
          GROUP BY visitor_id
       ),
       -- One row per return visit, not one per visitor: a visitor who comes
       -- back on day 3 and again on day 20 belongs in both buckets. Collapsing
       -- to their last visit would quietly empty the early ones.
       returns AS (
         SELECT f.visitor_id,
                (EXTRACT(EPOCH FROM (a.created_at - f.started)) / 86400)::int AS days_later
           FROM first_seen f
           JOIN page_analytics a
             ON a.visitor_id = f.visitor_id AND a.created_at > f.started
          WHERE a.created_at >= $1::timestamp
       )
       -- Only visitors old enough to have had the chance to return within a
       -- bucket count towards it; otherwise yesterday's arrivals drag every
       -- longer bucket towards zero.
       SELECT b.label, b.lo, b.hi,
              (SELECT COUNT(*)::int FROM first_seen f
                WHERE f.started <= NOW() - make_interval(days => b.lo)) AS eligible,
              (SELECT COUNT(DISTINCT f.visitor_id)::int FROM first_seen f
                JOIN returns r ON r.visitor_id = f.visitor_id
                WHERE f.started <= NOW() - make_interval(days => b.lo)
                  AND r.days_later BETWEEN b.lo AND b.hi) AS returned
         FROM (VALUES
                 ('Day 1-7', 1, 7),
                 ('Day 8-14', 8, 14),
                 ('Day 15-30', 15, 30),
                 ('Day 31-60', 31, 60),
                 ('Day 61-90', 61, 90)
              ) AS b(label, lo, hi)
        WHERE b.lo <= $2::int
        ORDER BY b.lo`,
      [since, days]
    );

    const buckets = (result.rows as Array<{ label: string; eligible: number; returned: number }>)
      .map((row) => ({
        label: row.label,
        eligible: row.eligible,
        returned: row.returned,
        rate: row.eligible === 0 ? null : Math.round((row.returned / row.eligible) * 1000) / 10,
      }));

    res.json({ days, measuring_since: since, buckets });
  } catch (error) {
    console.error('getRetention failed', error);
    res.status(500).json({ error: 'Failed to build the retention curve' });
  }
}

/**
 * Monthly cohorts by month of first visit, and how many returned in each later
 * month.
 *
 * A cell is null rather than zero where that month has not happened yet, so an
 * unreachable future reads as blank on the heatmap instead of as total loss.
 */
async function getCohorts(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const months = Math.min(24, Math.max(1, Number(req.query.months) || 6));
    const since = await measuringSince(db);

    const result = await db.query(
      `WITH first_seen AS (
         SELECT visitor_id, MIN(created_at) AS started
           FROM page_analytics
          WHERE created_at >= $1::timestamp AND visitor_id IS NOT NULL
          GROUP BY visitor_id
       ),
       cohorts AS (
         SELECT date_trunc('month', started)::date AS cohort, visitor_id, started
           FROM first_seen
          WHERE started >= date_trunc('month', NOW()) - make_interval(months => $2::int - 1)
       ),
       activity AS (
         SELECT c.cohort, c.visitor_id,
                (EXTRACT(YEAR FROM AGE(date_trunc('month', a.created_at), c.cohort)) * 12
                 + EXTRACT(MONTH FROM AGE(date_trunc('month', a.created_at), c.cohort)))::int AS month_index
           FROM cohorts c
           JOIN page_analytics a ON a.visitor_id = c.visitor_id
          WHERE a.created_at >= $1::timestamp
       )
       SELECT cohort,
              month_index,
              COUNT(DISTINCT visitor_id)::int AS visitors
         FROM activity
        WHERE month_index >= 0 AND month_index < $2::int
        GROUP BY cohort, month_index
        ORDER BY cohort, month_index`,
      [since, months]
    );

    // Reshaped here rather than in SQL: a crosstab would need a fixed column
    // list, and the number of months is a parameter.
    const byCohort = new Map<string, Map<number, number>>();
    for (const row of result.rows as Array<{ cohort: string; month_index: number; visitors: number }>) {
      const key = String(row.cohort).slice(0, 7);
      if (!byCohort.has(key)) byCohort.set(key, new Map());
      byCohort.get(key)!.set(row.month_index, row.visitors);
    }

    const now = new Date();
    const rows = [...byCohort.entries()].map(([cohort, counts]) => {
      const size = counts.get(0) ?? 0;
      const [year, month] = cohort.split('-').map(Number);
      // Months between this cohort and now; anything beyond is not yet knowable.
      const elapsed = (now.getFullYear() - (year ?? 0)) * 12 + (now.getMonth() + 1 - (month ?? 1));
      return {
        cohort,
        size,
        cells: Array.from({ length: months }, (_, i) => {
          if (i > elapsed) return null;
          if (size === 0) return null;
          return Math.round(((counts.get(i) ?? 0) / size) * 1000) / 10;
        }),
      };
    });

    res.json({ months, measuring_since: since, rows });
  } catch (error) {
    console.error('getCohorts failed', error);
    res.status(500).json({ error: 'Failed to build the cohort table' });
  }
}

export function createAdminAnalyticsRouter(db: Pool): express.Router {
  const router = express.Router();
  const resolveAdmin = createResolveAdmin(db);

  router.use(authenticate, resolveAdmin, createResolvePermissions(db), requirePanelAccess);

  router.get('/overview', requirePermission('view:analytics'), (req, res) => getOverview(db, req as AuthRequest, res));
  router.get('/time-series', requirePermission('view:analytics'), (req, res) => getTimeSeries(db, req as AuthRequest, res));
  router.get('/browsers', requirePermission('view:analytics'), (req, res) => getBrowserStats(db, req as AuthRequest, res));
  router.get('/countries', requirePermission('view:analytics'), (req, res) => getCountryStats(db, req as AuthRequest, res));
  router.get('/page', requirePermission('view:analytics'), (req, res) => getPageDetail(db, req as AuthRequest, res));
  router.get('/forecast', requirePermission('view:analytics'), (req, res) => getForecast(db, req as AuthRequest, res));
  router.get('/funnel', requirePermission('view:analytics'), (req, res) => getFunnel(db, req as AuthRequest, res));
  router.get('/heatmap', requirePermission('view:analytics'), (req, res) => getVisitHeatmap(db, req as AuthRequest, res));
  router.get('/report', requirePermission('view:analytics'), (req, res) => getReport(db, req as AuthRequest, res));
  router.get('/retention', requirePermission('view:analytics'), (req, res) => getRetention(db, req as AuthRequest, res));
  router.get('/cohorts', requirePermission('view:analytics'), (req, res) => getCohorts(db, req as AuthRequest, res));

  return router;
}

/**
 * Public tracker route — no auth by design; visitors are not logged in.
 *
 * A permission guard was swept onto this by the pass that guarded the admin
 * routers. It is not currently mounted anywhere (a middleware records views
 * instead), so nothing broke, but an admin-only check on a route meant for the
 * public would 403 every visitor the moment someone mounted it.
 */
export function createPublicAnalyticsRouter(db: Pool): express.Router {
  const router = express.Router();
  router.post('/track', (req, res) => trackPageView(db, req, res));
  return router;
}
