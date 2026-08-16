import type { Request, Response, NextFunction } from 'express';
import type { Pool } from 'pg';
import { verifyToken } from '../utils/jwt.js';

declare global {
  namespace Express {
    interface Request {
      file?: any;
      files?: any;
    }
  }
}

export interface AuthRequest extends Request {
  userId?: string;
  isAdmin?: boolean;
  /** Permission names for this request's user; see middleware/permissions. */
  permissions?: Set<string>;
  /** The users.role value behind those permissions. */
  role?: string | null;
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    res.status(401).json({ error: 'Missing token' });
    return;
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  req.userId = decoded.userId;
  next();
}

/**
 * Resolves `req.isAdmin` from users.role.
 *
 * `authenticate` only proves *who* the caller is — it never sets `isAdmin`.
 * Without this middleware in front of it, `requireAdmin` rejects every request,
 * so admin routes mount it as `authenticate -> resolveAdmin -> requireAdmin`.
 *
 * This used to read admin_users, while /me read users.role. The two disagreed:
 * admin_users was empty, so every admin endpoint returned 403 while the panel
 * showed the user as an administrator. users.role is now the single source of
 * truth, matching /me.
 */
export function createResolveAdmin(db: Pool) {
  return async function resolveAdmin(
    req: AuthRequest,
    _res: Response,
    next: NextFunction
  ): Promise<void> {
    if (!req.userId) {
      req.isAdmin = false;
      next();
      return;
    }

    try {
      const result = await db.query(
        'SELECT role, is_active FROM users WHERE id = $1',
        [req.userId]
      );
      const row = result.rows[0] as { role?: string; is_active?: boolean } | undefined;
      // A deactivated account keeps its role but loses access.
      req.isAdmin = row?.role === 'admin' && row.is_active !== false;
    } catch {
      // Fail closed: a lookup error must never grant admin.
      req.isAdmin = false;
    }

    next();
  };
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.isAdmin) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}
