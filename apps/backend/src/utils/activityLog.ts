import type { Pool } from 'pg';
import type { AuthRequest } from '../middleware/auth.js';

export type ActivityAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'restore'
  | 'status_change'
  | 'invite'
  | 'upload'
  /** A question put to the assistant, kept so its token cost is visible. */
  | 'ask';

export interface ActivityContext {
  /** Row as it was before the change, for update/delete. */
  oldValues?: Record<string, unknown> | null;
  /** Row as it is after the change, for create/update/restore. */
  newValues?: Record<string, unknown> | null;
  /** Free-form extras kept for backwards compatibility with existing callers. */
  details?: Record<string, unknown>;
  /** Request the change came from, for ip_address / user_agent. */
  req?: AuthRequest;
}

/** Columns never worth storing in an audit row. */
const NOISE_KEYS = new Set(['password', 'password_hash', 'token', 'refresh_token']);

function scrub(value: Record<string, unknown> | null | undefined): string | null {
  if (!value) return null;
  const clean: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    if (NOISE_KEYS.has(key)) continue;
    clean[key] = val;
  }
  return JSON.stringify(clean);
}

function clientIp(req?: AuthRequest): string | null {
  if (!req) return null;
  // nginx sets X-Forwarded-For; take the original client, not the proxy chain.
  const forwarded = req.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const ip = raw ? raw.split(',')[0]?.trim() : req.socket?.remoteAddress;
  return ip ? ip.slice(0, 45) : null;
}

/**
 * Records one admin action for the Activity Log page. Never throws — a logging
 * failure must not fail the mutation it's describing, so errors are swallowed
 * after being reported to stderr.
 */
export async function logActivity(
  db: Pool,
  adminUserId: string | undefined,
  action: ActivityAction,
  entityType: string,
  entityId: string | null | undefined,
  contextOrDetails?: ActivityContext | Record<string, unknown>
): Promise<void> {
  try {
    // Existing callers pass a plain details object; newer ones pass a context.
    const context: ActivityContext =
      contextOrDetails &&
      ('oldValues' in contextOrDetails ||
        'newValues' in contextOrDetails ||
        'req' in contextOrDetails ||
        'details' in contextOrDetails)
        ? (contextOrDetails as ActivityContext)
        : { details: contextOrDetails as Record<string, unknown> | undefined };

    const userAgent = context.req?.headers['user-agent'];

    await db.query(
      `INSERT INTO admin_activity_log
         (admin_user_id, action, entity_type, entity_id, details,
          old_values, new_values, ip_address, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        adminUserId ?? null,
        action,
        entityType,
        entityId ?? null,
        context.details ? JSON.stringify(context.details) : null,
        scrub(context.oldValues),
        scrub(context.newValues),
        clientIp(context.req),
        typeof userAgent === 'string' ? userAgent.slice(0, 500) : null,
      ]
    );
  } catch (error) {
    console.error('logActivity failed (non-fatal)', error);
  }
}
