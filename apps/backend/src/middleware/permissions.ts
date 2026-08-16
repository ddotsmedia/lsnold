import type { Response, NextFunction } from 'express';
import type { Pool } from 'pg';
import type { AuthRequest } from './auth.js';

/**
 * Permission checks for the admin panel.
 *
 * The factory takes the pool and returns the middleware, rather than the
 * middleware taking the pool: Express calls a handler as (req, res, next), so a
 * function whose first parameter is a Pool would be handed the request instead
 * and never run its query.
 *
 * Permissions are resolved once per request by `resolvePermissions` and cached
 * on the request, so a route guarded by several checks does not issue several
 * queries for the same answer.
 *
 * Everything here fails closed. A lookup error denies rather than allows.
 */

export function createResolvePermissions(db: Pool) {
  return async function resolvePermissions(
    req: AuthRequest,
    _res: Response,
    next: NextFunction
  ): Promise<void> {
    req.permissions = new Set<string>();

    if (!req.userId) { next(); return; }

    try {
      // Joined on users.role = roles.name: users.role is the existing, single
      // source of truth for who someone is. See migration 029.
      const result = await db.query(
        `SELECT p.name
           FROM users u
           JOIN roles r ON r.name = u.role
           JOIN role_permissions rp ON rp.role_id = r.id
           JOIN permissions p ON p.id = rp.permission_id
          WHERE u.id = $1 AND u.is_active IS NOT FALSE`,
        [req.userId]
      );
      for (const row of result.rows as Array<{ name: string }>) {
        req.permissions.add(row.name);
      }
      req.role = (
        await db.query('SELECT role FROM users WHERE id = $1', [req.userId])
      ).rows[0]?.role ?? null;
    } catch (error) {
      console.error('resolvePermissions failed', error);
      req.permissions = new Set<string>();
    }

    next();
  };
}

/** Guards one route on one named permission. */
export function requirePermission(permission: string) {
  return function check(req: AuthRequest, res: Response, next: NextFunction): void {
    if (req.permissions?.has(permission)) { next(); return; }
    res.status(403).json({
      error: 'Insufficient permissions',
      required: permission,
    });
  };
}

/**
 * Gate for the admin panel as a whole, replacing the blanket admin-only check.
 *
 * Any role carrying at least one permission may reach the panel; what they can
 * actually do is decided per route. Without this an editor or viewer would be
 * refused at the door and the roles below admin would mean nothing.
 */
export function requirePanelAccess(req: AuthRequest, res: Response, next: NextFunction): void {
  if (req.permissions && req.permissions.size > 0) { next(); return; }
  res.status(403).json({ error: 'Admin access required' });
}
