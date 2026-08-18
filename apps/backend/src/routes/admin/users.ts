import express from 'express';
import type { Response } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { authenticate, createResolveAdmin, requireAdmin } from '../../middleware/auth.js';
import { createResolvePermissions, requirePermission, requirePanelAccess } from '../../middleware/permissions.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { sendTabular, type Column } from '../../utils/tabular.js';
import { logActivity } from '../../utils/activityLog.js';
import { parseSort } from '../../utils/sorting.js';
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

    const ALLOWED_SORTS = ['created_at', 'name', 'email', 'role', 'last_login_at'] as const;
    const { clause: orderBy, terms: sortTerms } = parseSort(req, ALLOWED_SORTS, 'created_at', 'u');

    const countResult = await db.query(`SELECT COUNT(*) FROM users u ${where}`, params);
    const total = Number(countResult.rows[0]?.count ?? 0);

    const dataResult = await db.query(
      `SELECT u.id, u.email, u.name, u.phone, u.role, u.is_active, u.last_login_at,
              u.password_reset_required, u.created_at, u.updated_at,
              au.role as admin_role, au.permissions as admin_permissions
       FROM users u
       LEFT JOIN admin_users au ON au.user_id = u.id
       ${where}
       ORDER BY ${orderBy}
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset]
    );

    res.json({ data: dataResult.rows, sort: sortTerms, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
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

// ---------- Account state ----------

/**
 * Switches an account on or off.
 *
 * is_active is the existing flag that resolveAdmin and resolvePermissions both
 * read, and now the login handler too — so switching it off ends the account's
 * access rather than merely emptying its panel.
 *
 * An existing token stays valid until it expires; permissions are resolved from
 * the database on every request, so a disabled account can do nothing with it.
 */
async function setActive(db: Pool, req: AuthRequest, res: Response, active: boolean): Promise<void> {
  try {
    const { id } = req.params;

    // Locking yourself out is a support call, and with two administrators it
    // could leave nobody able to manage the panel.
    if (id === req.userId) {
      res.status(400).json({ error: 'You cannot disable your own account' });
      return;
    }

    if (!active) {
      // Refuse if this is the last administrator who could switch it back on.
      const remaining = await db.query(
        `SELECT COUNT(*)::int AS n FROM users
          WHERE role = 'admin' AND is_active IS NOT FALSE AND id <> $1`,
        [id]
      );
      if ((remaining.rows[0] as { n: number }).n === 0) {
        res.status(400).json({
          error: 'That is the last active administrator. Promote another account first.',
        });
        return;
      }
    }

    const result = await db.query(
      'UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, is_active',
      [active, id]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'User not found' }); return; }

    await logActivity(db, req.userId, 'update', 'user', id, {
      newValues: { is_active: active }, req,
    });
    res.json(result.rows[0]);
  } catch (error) {
    if ((error as { code?: string }).code === '22P02') { res.status(404).json({ error: 'User not found' }); return; }
    console.error('setActive failed', error);
    res.status(500).json({ error: 'Failed to update the account' });
  }
}

/** Makes the next sign-in change the password before anything else. */
async function forcePasswordReset(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const result = await db.query(
      'UPDATE users SET password_reset_required = TRUE, updated_at = NOW() WHERE id = $1 RETURNING id, email',
      [req.params.id]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'User not found' }); return; }

    await logActivity(db, req.userId, 'update', 'user', req.params.id as string, {
      newValues: { password_reset_required: true }, req,
    });
    res.json({ ...result.rows[0], password_reset_required: true });
  } catch (error) {
    if ((error as { code?: string }).code === '22P02') { res.status(404).json({ error: 'User not found' }); return; }
    console.error('forcePasswordReset failed', error);
    res.status(500).json({ error: 'Failed to require a password reset' });
  }
}

/** Recent sign-in attempts for one account, successes and refusals alike. */
async function getLoginHistory(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const result = await db.query(
      `SELECT id, succeeded, failure_reason, ip_address, device_type, browser, created_at
         FROM login_history WHERE user_id = $1
        ORDER BY created_at DESC LIMIT $2`,
      [req.params.id, limit]
    );
    res.json(result.rows);
  } catch (error) {
    if ((error as { code?: string }).code === '22P02') { res.json([]); return; }
    console.error('getLoginHistory failed', error);
    res.status(500).json({ error: 'Failed to fetch login history' });
  }
}

// ---------- Activity Log ----------
const ACTIVITY_COLUMNS: Column[] = [
  { key: 'created_at', header: 'When', type: 'datetime' },
  { key: 'admin_name', header: 'Who' },
  { key: 'admin_email', header: 'Email' },
  { key: 'action', header: 'Action' },
  { key: 'entity_type', header: 'Type' },
  { key: 'entity_id', header: 'Record' },
  { key: 'old_values', header: 'Before' },
  { key: 'new_values', header: 'After' },
  { key: 'ip_address', header: 'IP' },
];

/**
 * The filtered log as a file, for keeping or handing over.
 *
 * Snapshots are flattened to text: a spreadsheet cell cannot hold a JSON
 * object, and an audit trail is worth little if the before and after are the
 * one thing missing from the export.
 */
function flattenSnapshot(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object') return String(value);
  return Object.entries(value as Record<string, unknown>)
    .map(([key, v]) => `${key}: ${v === null ? '—' : String(v)}`)
    .join('; ');
}

async function exportActivityLog(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const rows = await queryActivityLog(db, req);
    const flattened = rows.map((row) => ({
      ...row,
      old_values: flattenSnapshot(row.old_values),
      new_values: flattenSnapshot(row.new_values),
    }));
    await sendTabular(res, req, flattened, ACTIVITY_COLUMNS, 'activity-log');
  } catch (error) {
    console.error('exportActivityLog failed', error);
    res.status(500).json({ error: 'Failed to export the activity log' });
  }
}

/**
 * The filter clause both the list and the export use.
 *
 * Shared so an export can never disagree with the screen it was taken from —
 * an audit file that quietly holds different rows than the ones on display is
 * worse than no export.
 */
function activityFilters(req: AuthRequest): { where: string; params: unknown[]; nextIdx: number } {
  const entityType = req.query.entityType as string | undefined;
    const action = req.query.action as string | undefined;
    const adminId = req.query.adminId as string | undefined;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const search = req.query.search as string | undefined;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (entityType) { conditions.push(`al.entity_type = $${paramIdx++}`); params.push(entityType); }
    if (action) { conditions.push(`al.action = $${paramIdx++}`); params.push(action); }
    if (adminId) { conditions.push(`al.admin_user_id = $${paramIdx++}::uuid`); params.push(adminId); }
    if (dateFrom) { conditions.push(`al.created_at >= $${paramIdx++}::date`); params.push(dateFrom); }
    // Inclusive of the whole end day, matching the other date filters.
    if (dateTo) {
      conditions.push(`al.created_at < ($${paramIdx++}::date + INTERVAL '1 day')`);
      params.push(dateTo);
    }
    if (search) {
      // entity_id is a uuid, so it is compared as text — a partial id is what
      // somebody actually has to hand when tracing a record.
      conditions.push(
        `(al.entity_id::text ILIKE $${paramIdx} OR al.entity_type ILIKE $${paramIdx}`
        + ` OR u.name ILIKE $${paramIdx} OR u.email ILIKE $${paramIdx})`
      );
      params.push(`%${search}%`);
      paramIdx++;
    }

  return {
    where: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
    nextIdx: paramIdx,
  };
}

/** Every matching row, unpaginated — for the export. */
async function queryActivityLog(
  db: Pool,
  req: AuthRequest
): Promise<Array<Record<string, unknown>>> {
  const { where, params } = activityFilters(req);
  const result = await db.query(
    `SELECT al.created_at, al.action, al.entity_type, al.entity_id,
            al.old_values, al.new_values, al.ip_address,
            u.name AS admin_name, u.email AS admin_email
       FROM admin_activity_log al
       LEFT JOIN users u ON al.admin_user_id = u.id
       ${where}
      ORDER BY al.created_at DESC
      LIMIT 5000`,
    params
  );
  return result.rows as Array<Record<string, unknown>>;
}

async function getActivityLog(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
    const offset = (page - 1) * limit;

    const { where, params, nextIdx } = activityFilters(req);

    const countResult = await db.query(
      `SELECT COUNT(*) FROM admin_activity_log al
         LEFT JOIN users u ON al.admin_user_id = u.id ${where}`,
      params
    );
    const total = Number(countResult.rows[0]?.count ?? 0);

    // action and entity_type are worth sorting by: grouping every delete, or
    // every change to one kind of record, is how this page actually gets read.
    const ALLOWED_SORTS = ['created_at', 'action', 'entity_type'] as const;
    const { clause: activityOrder } = parseSort(req, ALLOWED_SORTS, 'created_at', 'al');

    const dataResult = await db.query(
      `SELECT al.*, u.name as admin_name, u.email as admin_email
       FROM admin_activity_log al
       LEFT JOIN users u ON al.admin_user_id = u.id
       ${where}
       ORDER BY ${activityOrder}
       LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`,
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
  router.get('/activity-log/export', requirePermission('view:users'), (req, res) => exportActivityLog(db, req as AuthRequest, res));

  // Users
  router.get('/', requirePermission('view:users'), (req, res) => listUsers(db, req as AuthRequest, res));
  router.get('/:id', requirePermission('view:users'), (req, res) => getUser(db, req as AuthRequest, res));
  router.post('/invite', requirePermission('create:users'), (req, res) => inviteAdmin(db, req as AuthRequest, res));
  router.put('/:id/role', requirePermission('edit:users'), (req, res) => updateRole(db, req as AuthRequest, res));
  router.delete('/:id/admin', requirePermission('delete:users'), (req, res) => revokeAdmin(db, req as AuthRequest, res));

  // Account state. Disabling ends access, so it needs the edit permission.
  router.get('/:id/login-history', requirePermission('view:users'), (req, res) => getLoginHistory(db, req as AuthRequest, res));
  router.post('/:id/disable', requirePermission('edit:users'), (req, res) => setActive(db, req as AuthRequest, res, false));
  router.post('/:id/enable', requirePermission('edit:users'), (req, res) => setActive(db, req as AuthRequest, res, true));
  router.post('/:id/force-password-reset', requirePermission('edit:users'), (req, res) => forcePasswordReset(db, req as AuthRequest, res));

  return router;
}
