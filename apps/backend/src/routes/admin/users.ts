import express from 'express';
import type { Response } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { authenticate, createResolveAdmin, requireAdmin } from '../../middleware/auth.js';
import { createResolvePermissions, requirePermission, requirePanelAccess } from '../../middleware/permissions.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { logActivity } from '../../utils/activityLog.js';
import { hashPassword } from '../../utils/hash.js';
import { getDashboardStats } from '../../controllers/dashboardController.js';

const InviteSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(255),
  password: z.string().min(8),
  role: z.enum(['admin', 'editor', 'viewer']).optional(),
  permissions: z.array(z.string()).optional(),
});

const RoleUpdateSchema = z.object({
  role: z.enum(['admin', 'editor', 'viewer']),
  permissions: z.array(z.string()).optional(),
});

// ---------- Users ----------
async function listUsers(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const search = req.query.search as string | undefined;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (search) {
      conditions.push(`(LOWER(u.name) LIKE $${paramIdx} OR LOWER(u.email) LIKE $${paramIdx})`);
      params.push(`%${search.toLowerCase()}%`);
      paramIdx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await db.query(`SELECT COUNT(*) FROM users u ${where}`, params);
    const total = Number(countResult.rows[0]?.count ?? 0);

    const dataResult = await db.query(
      `SELECT u.id, u.email, u.name, u.phone, u.role, u.created_at, u.updated_at,
              au.role as admin_role, au.permissions as admin_permissions
       FROM users u
       LEFT JOIN admin_users au ON au.user_id = u.id
       ${where}
       ORDER BY u.created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset]
    );

    res.json({ data: dataResult.rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('listUsers failed', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
}

async function getUser(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await db.query(
      `SELECT u.id, u.email, u.name, u.phone, u.role, u.created_at, u.updated_at,
              au.role as admin_role, au.permissions as admin_permissions
       FROM users u
       LEFT JOIN admin_users au ON au.user_id = u.id
       WHERE u.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'User not found' }); return; }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('getUser failed', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
}

async function inviteAdmin(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const data = InviteSchema.parse(req.body);
    const hash = await hashPassword(data.password);

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // Create user (or skip if email already exists)
      const userResult = await client.query(
        `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [data.email, data.name, hash]
      );
      const userId = (userResult.rows[0] as { id: string }).id;

      // Grant admin role
      await client.query(
        `INSERT INTO admin_users (user_id, role, permissions) VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO UPDATE SET role = $2, permissions = $3`,
        [userId, data.role || 'viewer', data.permissions || []]
      );

      // users.role is what resolveAdmin reads; without this the invited admin
      // would be listed as one but get 403 from every admin endpoint.
      await client.query('UPDATE users SET role = $1 WHERE id = $2', [data.role || 'viewer', userId]);

      await client.query('COMMIT');

      await logActivity(db, req.userId, 'invite', 'user', userId, {
        email: data.email,
        role: data.role || 'viewer',
      });

      res.status(201).json({ id: userId, email: data.email, name: data.name, role: data.role || 'viewer' });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: error.issues }); return; }
    console.error('inviteAdmin failed', error);
    res.status(500).json({ error: 'Failed to invite admin' });
  }
}

async function updateRole(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const data = RoleUpdateSchema.parse(req.body);

    // Prevent self-demotion
    if (id === req.userId) {
      res.status(400).json({ error: 'Cannot change your own role' });
      return;
    }

    const result = await db.query(
      `INSERT INTO admin_users (user_id, role, permissions) VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET role = $2, permissions = $3
       RETURNING *`,
      [id, data.role, data.permissions || []]
    );

    // Keep users.role, the authorization source of truth, in step.
    await db.query('UPDATE users SET role = $1 WHERE id = $2', [data.role, id]);

    await logActivity(db, req.userId, 'update', 'admin_user', id, { role: data.role });
    res.json(result.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) { res.status(400).json({ error: 'Validation failed', details: error.issues }); return; }
    console.error('updateRole failed', error);
    res.status(500).json({ error: 'Failed to update role' });
  }
}

async function revokeAdmin(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    if (id === req.userId) {
      res.status(400).json({ error: 'Cannot revoke your own admin access' });
      return;
    }

    const result = await db.query('DELETE FROM admin_users WHERE user_id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Admin user not found' }); return; }
    // users.role decides isAdmin, so revoking must clear it there too —
    // otherwise the account keeps full admin access.
    await db.query("UPDATE users SET role = 'user' WHERE id = $1", [id]);
    await logActivity(db, req.userId, 'delete', 'admin_user', id);
    res.status(204).send();
  } catch (error) {
    console.error('revokeAdmin failed', error);
    res.status(500).json({ error: 'Failed to revoke admin access' });
  }
}

// ---------- Activity Log ----------
async function getActivityLog(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
    const offset = (page - 1) * limit;
    const entityType = req.query.entityType as string | undefined;
    const action = req.query.action as string | undefined;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (entityType) { conditions.push(`al.entity_type = $${paramIdx++}`); params.push(entityType); }
    if (action) { conditions.push(`al.action = $${paramIdx++}`); params.push(action); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await db.query(`SELECT COUNT(*) FROM admin_activity_log al ${where}`, params);
    const total = Number(countResult.rows[0]?.count ?? 0);

    const dataResult = await db.query(
      `SELECT al.*, u.name as admin_name, u.email as admin_email
       FROM admin_activity_log al
       LEFT JOIN users u ON al.admin_user_id = u.id
       ${where}
       ORDER BY al.created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset]
    );

    res.json({ data: dataResult.rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('getActivityLog failed', error);
    res.status(500).json({ error: 'Failed to fetch activity log' });
  }
}

// ---------- Dashboard Stats ----------
// The implementation lives in dashboardController so /admin/users/dashboard and
// /admin/dashboard/stats cannot drift apart. The version that used to be here
// ran Promise.all over tables that do not exist in production, so one missing
// relation returned a 500 and the admin home page rendered nothing at all.

export function createAdminUsersRouter(db: Pool): express.Router {
  const router = express.Router();
  const resolveAdmin = createResolveAdmin(db);

  router.use(authenticate, resolveAdmin, createResolvePermissions(db), requirePanelAccess);

  // Dashboard
  router.get('/dashboard', requirePermission('view:users'), (req, res) => getDashboardStats(db, req as AuthRequest, res));

  // Activity Log
  router.get('/activity-log', requirePermission('view:users'), (req, res) => getActivityLog(db, req as AuthRequest, res));

  // Users
  router.get('/', requirePermission('view:users'), (req, res) => listUsers(db, req as AuthRequest, res));
  router.get('/:id', requirePermission('view:users'), (req, res) => getUser(db, req as AuthRequest, res));
  router.post('/invite', requirePermission('create:users'), (req, res) => inviteAdmin(db, req as AuthRequest, res));
  router.put('/:id/role', requirePermission('edit:users'), (req, res) => updateRole(db, req as AuthRequest, res));
  router.delete('/:id/admin', requirePermission('delete:users'), (req, res) => revokeAdmin(db, req as AuthRequest, res));

  return router;
}
