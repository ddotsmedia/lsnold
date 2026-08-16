import express from 'express';
import type { Response } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { authenticate, createResolveAdmin } from '../../middleware/auth.js';
import type { AuthRequest } from '../../middleware/auth.js';
import {
  createResolvePermissions,
  requirePermission,
  requirePanelAccess,
} from '../../middleware/permissions.js';
import { logActivity } from '../../utils/activityLog.js';

/**
 * Roles and what each may do.
 *
 * Reading the matrix needs view:users, which every role above viewer has —
 * seeing that a viewer cannot delete pages is not sensitive. Changing it needs
 * manage:permissions, which only admin holds.
 */

async function listRoles(db: Pool, _req: AuthRequest, res: Response): Promise<void> {
  try {
    const [roles, permissions, matrix, counts] = await Promise.all([
      db.query('SELECT id, name, description FROM roles ORDER BY name'),
      db.query('SELECT id, name, description FROM permissions ORDER BY name'),
      db.query('SELECT role_id, permission_id FROM role_permissions'),
      // How many people hold each role, so nobody removes the last admin's
      // rights without seeing what it costs.
      db.query('SELECT role, COUNT(*)::int AS users FROM users WHERE is_active IS NOT FALSE GROUP BY role'),
    ]);

    const byRole: Record<string, string[]> = {};
    for (const row of matrix.rows as Array<{ role_id: string; permission_id: string }>) {
      (byRole[row.role_id] ??= []).push(row.permission_id);
    }
    const userCounts = Object.fromEntries(
      (counts.rows as Array<{ role: string; users: number }>).map((r) => [r.role, r.users])
    );

    res.json({
      roles: (roles.rows as Array<{ id: string; name: string }>).map((r) => ({
        ...r,
        permission_ids: byRole[r.id] ?? [],
        user_count: userCounts[r.name] ?? 0,
      })),
      permissions: permissions.rows,
    });
  } catch (error) {
    console.error('listRoles failed', error);
    res.status(500).json({ error: 'Failed to fetch roles' });
  }
}

const PermissionsSchema = z.object({ permission_ids: z.array(z.string().uuid()).max(200) });

async function setRolePermissions(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  const client = await db.connect();
  try {
    const { id } = req.params;
    const { permission_ids: ids } = PermissionsSchema.parse(req.body);

    const role = await db.query('SELECT name FROM roles WHERE id = $1', [id]);
    if (role.rows.length === 0) { res.status(404).json({ error: 'Role not found' }); return; }
    const name = (role.rows[0] as { name: string }).name;

    // The admin role cannot be reduced. There is no other way back in: an
    // administrator who removed manage:permissions from their own role would
    // have locked every account out of ever granting it again.
    if (name === 'admin') {
      res.status(400).json({
        error: 'The admin role always keeps every permission. Change a user\'s role instead.',
      });
      return;
    }

    await client.query('BEGIN');
    await client.query('DELETE FROM role_permissions WHERE role_id = $1', [id]);
    if (ids.length > 0) {
      await client.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         SELECT $1, unnest($2::uuid[]) ON CONFLICT DO NOTHING`,
        [id, ids]
      );
    }
    await client.query('COMMIT');

    await logActivity(db, req.userId, 'update', 'role', id as string, {
      newValues: { role: name, permission_count: ids.length }, req,
    });
    res.json({ role: name, permission_count: ids.length });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
      return;
    }
    console.error('setRolePermissions failed', error);
    res.status(500).json({ error: 'Failed to update permissions' });
  } finally { client.release(); }
}

export function createAdminRolesRouter(db: Pool): express.Router {
  const router = express.Router();
  const resolveAdmin = createResolveAdmin(db);
  const resolvePermissions = createResolvePermissions(db);

  router.use(authenticate, resolveAdmin, resolvePermissions, requirePanelAccess);

  router.get('/', requirePermission('view:users'), (req, res) => listRoles(db, req as AuthRequest, res));
  router.put('/:id/permissions', requirePermission('manage:permissions'), (req, res) =>
    setRolePermissions(db, req as AuthRequest, res));

  return router;
}
