import express from 'express';
import type { Response } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { authenticate, createResolveAdmin, requireAdmin } from '../../middleware/auth.js';
import { createResolvePermissions, requirePermission, requirePanelAccess } from '../../middleware/permissions.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { logActivity } from '../../utils/activityLog.js';

const SettingsUpdateSchema = z.object({
  key: z.string().min(1).max(255),
  value: z.record(z.unknown()),
});

async function getSettings(db: Pool, _req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await db.query('SELECT * FROM site_settings ORDER BY key ASC');
    // Return as a keyed object for easy consumption
    const settings: Record<string, unknown> = {};
    for (const row of result.rows) {
      const r = row as { key: string; value: unknown; updated_at: unknown };
      settings[r.key] = { value: r.value, updated_at: r.updated_at };
    }
    res.json(settings);
  } catch (error) {
    console.error('getSettings failed', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
}

async function getSetting(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { key } = req.params;
    const result = await db.query('SELECT * FROM site_settings WHERE key = $1', [key]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Setting not found' }); return; }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('getSetting failed', error);
    res.status(500).json({ error: 'Failed to fetch setting' });
  }
}

async function upsertSetting(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const data = SettingsUpdateSchema.parse(req.body);
    const result = await db.query(
      `INSERT INTO site_settings (key, value, updated_by, updated_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [data.key, JSON.stringify(data.value), req.userId]
    );
    await logActivity(db, req.userId, 'update', 'site_settings', data.key, { key: data.key });
    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: error.issues }); return; }
    console.error('upsertSetting failed', error);
    res.status(500).json({ error: 'Failed to update setting' });
  }
}

async function bulkUpdateSettings(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    if (typeof body !== 'object' || body === null) {
      res.status(400).json({ error: 'Body must be an object of key -> value pairs' });
      return;
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      for (const [key, value] of Object.entries(body)) {
        await client.query(
          `INSERT INTO site_settings (key, value, updated_by, updated_at)
           VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
           ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = CURRENT_TIMESTAMP`,
          [key, JSON.stringify(value), req.userId]
        );
      }
      await client.query('COMMIT');
    } catch (err) { await client.query('ROLLBACK'); throw err; }
    finally { client.release(); }

    await logActivity(db, req.userId, 'update', 'site_settings', null, { keys: Object.keys(body) });
    res.json({ success: true, updated: Object.keys(body).length });
  } catch (error) {
    console.error('bulkUpdateSettings failed', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
}

// Generate a sitemap XML based on published pages and settings
async function generateSitemap(db: Pool, _req: AuthRequest, res: Response): Promise<void> {
  try {
    const settingsResult = await db.query("SELECT value FROM site_settings WHERE key = 'sitemap'");
    const sitemapConfig = (settingsResult.rows[0]?.value ?? { change_frequency: 'weekly', priority_home: 1.0, priority_pages: 0.8 }) as Record<string, unknown>;

    const pagesResult = await db.query(
      "SELECT slug, updated_at FROM pages WHERE status = 'published' ORDER BY sort_order ASC"
    );
    const eventsResult = await db.query(
      "SELECT slug, updated_at FROM news_events ORDER BY published_at DESC LIMIT 50"
    );

    const baseUrl = 'https://www.littlesmartiesnursery.com';
    const changeFreq = (sitemapConfig.change_frequency as string) || 'weekly';

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    // Home page
    xml += `  <url>\n    <loc>${baseUrl}/</loc>\n    <changefreq>${changeFreq}</changefreq>\n    <priority>${sitemapConfig.priority_home || 1.0}</priority>\n  </url>\n`;

    // Static pages
    const staticPages = ['nursery', 'age-groups', 'facilities', 'gallery', 'events', 'contact', 'register', 'booking'];
    for (const sp of staticPages) {
      xml += `  <url>\n    <loc>${baseUrl}/${sp}</loc>\n    <changefreq>${changeFreq}</changefreq>\n    <priority>${sitemapConfig.priority_pages || 0.8}</priority>\n  </url>\n`;
    }

    // Dynamic pages
    for (const row of pagesResult.rows) {
      const p = row as { slug: string; updated_at: string };
      xml += `  <url>\n    <loc>${baseUrl}/${p.slug}</loc>\n    <lastmod>${new Date(p.updated_at).toISOString().split('T')[0]}</lastmod>\n    <changefreq>${changeFreq}</changefreq>\n    <priority>${sitemapConfig.priority_pages || 0.8}</priority>\n  </url>\n`;
    }

    // Events
    for (const row of eventsResult.rows) {
      const e = row as { slug: string; updated_at: string };
      xml += `  <url>\n    <loc>${baseUrl}/events/${e.slug}</loc>\n    <lastmod>${new Date(e.updated_at).toISOString().split('T')[0]}</lastmod>\n    <changefreq>${changeFreq}</changefreq>\n    <priority>0.6</priority>\n  </url>\n`;
    }

    xml += '</urlset>';

    res.setHeader('Content-Type', 'application/xml');
    res.send(xml);
  } catch (error) {
    console.error('generateSitemap failed', error);
    res.status(500).json({ error: 'Failed to generate sitemap' });
  }
}

// Robots.txt from settings
async function getRobotsTxt(db: Pool, _req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await db.query("SELECT value FROM site_settings WHERE key = 'robots_txt'");
    const config = (result.rows[0]?.value ?? { content: 'User-agent: *\nAllow: /' }) as { content: string };
    res.setHeader('Content-Type', 'text/plain');
    res.send(config.content);
  } catch (error) {
    console.error('getRobotsTxt failed', error);
    res.status(500).json({ error: 'Failed to fetch robots.txt' });
  }
}

export function createAdminSeoRouter(db: Pool): express.Router {
  const router = express.Router();
  const resolveAdmin = createResolveAdmin(db);

  router.use(authenticate, resolveAdmin, createResolvePermissions(db), requirePanelAccess);

  router.get('/settings', requirePermission('view:settings'), (req, res) => getSettings(db, req as AuthRequest, res));
  router.get('/settings/:key', requirePermission('view:settings'), (req, res) => getSetting(db, req as AuthRequest, res));
  router.put('/settings', requirePermission('manage:settings'), (req, res) => upsertSetting(db, req as AuthRequest, res));
  router.put('/settings/bulk', requirePermission('manage:settings'), (req, res) => bulkUpdateSettings(db, req as AuthRequest, res));
  router.get('/sitemap', requirePermission('view:settings'), (req, res) => generateSitemap(db, req as AuthRequest, res));
  router.get('/robots', requirePermission('view:settings'), (req, res) => getRobotsTxt(db, req as AuthRequest, res));

  return router;
}
