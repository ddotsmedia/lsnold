import express from 'express';
import type { Response } from 'express';
import type { Pool } from 'pg';
import type { AuthRequest } from '../middleware/auth.js';

/**
 * Public age groups (programmes).
 *
 * Read-only and unauthenticated, like the other public content endpoints. Every
 * mutation stays behind /api/v1/admin.
 */
async function listAgeGroups(db: Pool, _req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await db.query(
      `SELECT id, name, slug, description, min_age_months, max_age_months, image_url, icon_url, sort_order
         FROM age_groups
        WHERE deleted_at IS NULL
        ORDER BY sort_order ASC, min_age_months ASC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching age groups:', error);
    res.status(500).json({ error: 'Failed to fetch age groups' });
  }
}

export function createAgeGroupsRouter(db: Pool): express.Router {
  const router = express.Router();
  router.get('/', (req, res) => listAgeGroups(db, req as AuthRequest, res));
  return router;
}

export default createAgeGroupsRouter;
