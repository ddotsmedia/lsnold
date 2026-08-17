import express from 'express';
import type { Response } from 'express';
import type { Pool } from 'pg';
import { authenticate, createResolveAdmin } from '../../middleware/auth.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { createResolvePermissions, requirePanelAccess } from '../../middleware/permissions.js';

/**
 * One search box across the panel.
 *
 * Each type is queried separately and the results merged, rather than through a
 * materialised search table. With this much data the cost is a few milliseconds
 * and it removes a whole class of bug: there is no copy to fall out of step, so
 * an edit is searchable the instant it is committed and nothing needs
 * reindexing after a restore or a manual correction.
 *
 * A type is only queried when the caller holds the permission for it. Search is
 * the classic way data leaks across a permission boundary — a viewer with no
 * right to see registrations must not be able to read a child's name by typing
 * it into a box that queries everything.
 */

interface Searchable {
  type: string;
  permission: string;
  /** The expression matched and ranked against. */
  haystack: string;
  from: string;
  where: string;
  /** Columns returned, aliased to a common shape. */
  select: string;
  /** Where a result leads in the panel. */
  url: (row: Record<string, unknown>) => string;
}

const SOURCES: Searchable[] = [
  {
    type: 'registrations',
    permission: 'view:registrations',
    haystack: `coalesce(r.child_name,'') || ' ' || coalesce(r.parent_name,'') || ' '
               || coalesce(r.parent_email,'') || ' ' || coalesce(r.parent_phone,'')`,
    from: 'registrations r',
    where: 'r.deleted_at IS NULL',
    select: `r.id, r.child_name AS title,
             coalesce(r.parent_name,'') || ' · ' || coalesce(r.parent_email,'') AS subtitle,
             r.status AS badge, r.created_at`,
    url: () => '/admin/registrations',
  },
  {
    type: 'bookings',
    permission: 'view:bookings',
    haystack: `coalesce(b.visitor_name,'') || ' ' || coalesce(b.visitor_email,'') || ' '
               || coalesce(b.visitor_phone,'')`,
    from: 'tour_bookings b',
    where: 'b.deleted_at IS NULL',
    select: `b.id, b.visitor_name AS title,
             to_char(b.preferred_date,'DD Mon YYYY') || ' at ' || to_char(b.preferred_time,'HH24:MI') AS subtitle,
             b.status AS badge, b.created_at`,
    url: () => '/admin/bookings',
  },
  {
    type: 'pages',
    permission: 'view:pages',
    haystack: `coalesce(p.title,'') || ' ' || coalesce(p.slug,'')`,
    from: 'pages p',
    where: 'p.deleted_at IS NULL',
    select: `p.id, p.title, '/' || p.slug AS subtitle, p.status AS badge, p.created_at`,
    url: (row) => `/admin/pages/${row.id}/content`,
  },
  {
    type: 'sections',
    permission: 'view:pages',
    // Tags stripped to match the index expression exactly; without the same
    // expression the index is not used and a search matches on markup.
    haystack: `coalesce(s.title,'') || ' ' || regexp_replace(coalesce(s.content,''), '<[^>]*>', ' ', 'g')`,
    from: 'page_content_sections s',
    where: 's.deleted_at IS NULL',
    select: `s.id, coalesce(s.title, s.section_key) AS title,
             s.section_key AS subtitle, 'section' AS badge, s.created_at`,
    url: (row) => `/admin/pages/${row.page_id as string}/content`,
  },
  {
    type: 'events',
    permission: 'view:news',
    haystack: `coalesce(e.title,'') || ' ' || coalesce(e.description,'') || ' ' || coalesce(e.location,'')`,
    from: 'news_events e',
    where: 'e.deleted_at IS NULL',
    select: `e.id, e.title, coalesce(e.location, e.event_type) AS subtitle,
             e.event_type AS badge, e.created_at`,
    url: () => '/admin/events',
  },
  {
    type: 'media',
    permission: 'view:media',
    haystack: `coalesce(m.title,'') || ' ' || coalesce(m.alt_text,'')`,
    from: 'media m',
    where: 'm.deleted_at IS NULL',
    select: `m.id, m.title, coalesce(m.alt_text,'') AS subtitle, m.category AS badge, m.created_at`,
    url: () => '/admin/media',
  },
  {
    type: 'users',
    permission: 'view:users',
    haystack: `coalesce(u.name,'') || ' ' || coalesce(u.email,'')`,
    from: 'users u',
    where: 'TRUE',
    select: `u.id, u.name AS title, u.email AS subtitle, coalesce(u.role,'none') AS badge, u.created_at`,
    url: () => '/admin/users',
  },
];

async function search(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  const started = Date.now();
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    // Two characters is where a trigram match starts meaning anything; below
    // that every row matches and the answer is noise.
    if (q.length < 2) {
      res.json({ query: q, results: [], total: 0, took_ms: 0, types: [] });
      return;
    }

    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const wanted = typeof req.query.type === 'string'
      ? new Set(req.query.type.split(',').map((t) => t.trim()).filter(Boolean))
      : null;

    const permissions = req.permissions ?? new Set<string>();
    const sources = SOURCES.filter((s) =>
      permissions.has(s.permission) && (!wanted || wanted.has(s.type)));

    if (sources.length === 0) {
      res.json({ query: q, results: [], total: 0, took_ms: Date.now() - started, types: [] });
      return;
    }

    const pattern = `%${q}%`;
    const perType = await Promise.all(sources.map(async (source) => {
      // similarity() ranks: an exact or near-exact match sorts above a
      // scattered one, which is what "boost exact over partial" means here.
      const extra = source.type === 'sections' ? ', s.page_id' : '';
      const result = await db.query(
        `SELECT ${source.select}${extra},
                similarity(${source.haystack}, $2) AS score
           FROM ${source.from}
          WHERE ${source.where} AND (${source.haystack}) ILIKE $1
          ORDER BY score DESC, created_at DESC
          LIMIT $3`,
        [pattern, q, limit]
      );
      return (result.rows as Array<Record<string, unknown>>).map((row) => ({
        type: source.type,
        id: row.id,
        title: row.title ?? '(untitled)',
        subtitle: row.subtitle ?? '',
        badge: row.badge ?? null,
        score: Number(row.score ?? 0),
        url: source.url(row),
      }));
    }));

    const results = perType.flat().sort((a, b) => b.score - a.score);
    const types = sources.map((s, i) => ({ type: s.type, count: perType[i]!.length }))
      .filter((t) => t.count > 0);

    res.json({
      query: q,
      results: results.slice(0, limit),
      total: results.length,
      types,
      took_ms: Date.now() - started,
    });
  } catch (error) {
    console.error('search failed', error);
    res.status(500).json({ error: 'Search failed' });
  }
}

export function createAdminSearchRouter(db: Pool): express.Router {
  const router = express.Router();
  const resolveAdmin = createResolveAdmin(db);

  router.use(authenticate, resolveAdmin, createResolvePermissions(db), requirePanelAccess);

  // No requirePermission: the handler filters each type by the caller's own
  // permissions, so what one role may search differs from another's.
  router.get('/', (req, res) => search(db, req as AuthRequest, res));

  return router;
}
