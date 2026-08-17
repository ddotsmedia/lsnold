import type { Pool } from 'pg';
import type { Request } from 'express';

/**
 * Records sign-in attempts.
 *
 * Written from the login handler, not from the authenticate middleware. That
 * middleware runs on every authenticated request — the admin panel makes dozens
 * per screen, plus a socket — so recording there would insert thousands of rows
 * a day and would be a request log rather than a login history.
 *
 * Never throws. A failure to record must not stop somebody signing in, and must
 * not turn a refused password into a server error either.
 */

export type FailureReason = 'bad_password' | 'inactive';

/** Same derivation the analytics middleware uses, so the two agree. */
function parseAgent(userAgent: string): { device: string; browser: string } {
  let device = 'desktop';
  if (/mobile|android|iphone|ipod/i.test(userAgent)) device = 'mobile';
  else if (/tablet|ipad/i.test(userAgent)) device = 'tablet';

  let browser = 'other';
  if (/edg/i.test(userAgent)) browser = 'Edge';
  else if (/opr|opera/i.test(userAgent)) browser = 'Opera';
  else if (/chrome/i.test(userAgent)) browser = 'Chrome';
  else if (/firefox/i.test(userAgent)) browser = 'Firefox';
  else if (/safari/i.test(userAgent)) browser = 'Safari';

  return { device, browser };
}

/**
 * The caller's address.
 *
 * nginx sits in front, so req.ip is the proxy without this. The first entry in
 * X-Forwarded-For is the client; the rest are proxies it passed through.
 */
function clientIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim() ?? null;
  }
  return req.ip ?? null;
}

export async function recordLogin(
  db: Pool,
  userId: string,
  req: Request,
  failure?: FailureReason
): Promise<void> {
  try {
    const userAgent = String(req.headers['user-agent'] ?? '');
    const { device, browser } = parseAgent(userAgent);

    await db.query(
      `INSERT INTO login_history
         (user_id, succeeded, failure_reason, ip_address, user_agent, device_type, browser)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, !failure, failure ?? null, clientIp(req), userAgent.slice(0, 1000), device, browser]
    );

    if (!failure) {
      await db.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [userId]);
    }
  } catch (error) {
    console.error('recordLogin failed', error);
  }
}
