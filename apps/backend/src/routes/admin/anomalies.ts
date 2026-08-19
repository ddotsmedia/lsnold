import express from 'express';
import type { Response } from 'express';
import type { Pool } from 'pg';
import { authenticate, createResolveAdmin } from '../../middleware/auth.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { createResolvePermissions, requirePermission, requirePanelAccess } from '../../middleware/permissions.js';
import { logActivity } from '../../utils/activityLog.js';
import { detectAnomalies, judgeMetric, METRICS } from '../../services/anomalyDetection.js';

async function listAnomalies(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
    const openOnly = req.query.open === 'true';

    const result = await db.query(
      `SELECT a.*, u.name AS acknowledged_by_name
         FROM anomalies a
         LEFT JOIN users u ON u.id = a.acknowledged_by
        ${openOnly ? 'WHERE a.acknowledged_at IS NULL' : ''}
        ORDER BY a.created_at DESC
        LIMIT $1`,
      [limit]
    );
    res.json({ data: result.rows });
  } catch (error) {
    console.error('listAnomalies failed', error);
    res.status(500).json({ error: 'Failed to fetch anomalies' });
  }
}

/**
 * What the detector would say right now, without recording anything.
 *
 * Worth having separately from the list: it explains why a metric is silent —
 * not enough history, or a baseline too small to judge against — which a table
 * of past findings cannot show.
 */
async function previewDetection(db: Pool, _req: AuthRequest, res: Response): Promise<void> {
  try {
    const verdicts = await Promise.all(METRICS.map((m) => judgeMetric(db, m)));
    res.json({ verdicts });
  } catch (error) {
    console.error('previewDetection failed', error);
    res.status(500).json({ error: 'Failed to evaluate metrics' });
  }
}

/** Runs the check now rather than waiting for the morning. */
async function runNow(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const verdicts = await detectAnomalies(db);
    await logActivity(db, req.userId, 'update', 'anomaly_run', null, {
      newValues: { found: verdicts.filter((v) => v.status === 'anomaly').length },
      req,
    });
    res.json({ verdicts });
  } catch (error) {
    console.error('runNow failed', error);
    res.status(500).json({ error: 'Detection failed' });
  }
}

async function acknowledge(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await db.query(
      `UPDATE anomalies
          SET acknowledged_at = NOW(), acknowledged_by = $1
        WHERE id = $2 AND acknowledged_at IS NULL
        RETURNING id`,
      [req.userId ?? null, req.params.id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Not found, or already acknowledged' });
      return;
    }
    res.json({ id: req.params.id, acknowledged: true });
  } catch (error) {
    if ((error as { code?: string }).code === '22P02') { res.status(404).json({ error: 'Not found' }); return; }
    console.error('acknowledge failed', error);
    res.status(500).json({ error: 'Failed to acknowledge' });
  }
}

export function createAdminAnomaliesRouter(db: Pool): express.Router {
  const router = express.Router();
  const resolveAdmin = createResolveAdmin(db);

  router.use(authenticate, resolveAdmin, createResolvePermissions(db), requirePanelAccess);

  router.get('/', requirePermission('view:analytics'), (req, res) => listAnomalies(db, req as AuthRequest, res));
  router.get('/preview', requirePermission('view:analytics'), (req, res) => previewDetection(db, req as AuthRequest, res));
  // Running the check writes rows and can raise an alert, so it needs more than
  // read access.
  router.post('/run', requirePermission('manage:settings'), (req, res) => runNow(db, req as AuthRequest, res));
  router.post('/:id/acknowledge', requirePermission('view:analytics'), (req, res) => acknowledge(db, req as AuthRequest, res));

  return router;
}
