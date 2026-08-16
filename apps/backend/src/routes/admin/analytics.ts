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

export function createAdminAnalyticsRouter(db: Pool): express.Router {
  const router = express.Router();
  const resolveAdmin = createResolveAdmin(db);

  router.use(authenticate, resolveAdmin, createResolvePermissions(db), requirePanelAccess);

  router.get('/overview', requirePermission('view:analytics'), (req, res) => getOverview(db, req as AuthRequest, res));
  router.get('/time-series', requirePermission('view:analytics'), (req, res) => getTimeSeries(db, req as AuthRequest, res));
  router.get('/browsers', requirePermission('view:analytics'), (req, res) => getBrowserStats(db, req as AuthRequest, res));
  router.get('/countries', requirePermission('view:analytics'), (req, res) => getCountryStats(db, req as AuthRequest, res));
  router.get('/page', requirePermission('view:analytics'), (req, res) => getPageDetail(db, req as AuthRequest, res));

  return router;
}

// Public tracker route — mounted without auth
export function createPublicAnalyticsRouter(db: Pool): express.Router {
  const router = express.Router();
  router.post('/track', requirePermission('view:analytics'), (req, res) => trackPageView(db, req, res));
  return router;
}
