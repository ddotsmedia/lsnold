import type { Response, NextFunction } from 'express';
import type { AuthRequest } from './auth.js';

/**
 * A small fixed-window rate limiter for admin write endpoints.
 *
 * In-process on purpose: there is one backend container, and adding Redis for
 * this would be more moving parts than the problem deserves. If the backend is
 * ever scaled out, each replica would count separately and this needs replacing.
 *
 * Keyed by user id so one admin cannot spend another's allowance; falls back to
 * the request ip for anything that reaches here unauthenticated.
 */

interface Window {
  count: number;
  /** Epoch ms at which the current window ends. */
  resetAt: number;
}

const buckets = new Map<string, Window>();

/**
 * Dropped windows are cleaned on access rather than on a timer, so the map
 * cannot grow without bound and no interval keeps the process awake.
 */
function sweep(now: number): void {
  if (buckets.size < 500) return;
  for (const [key, window] of buckets) {
    if (window.resetAt <= now) buckets.delete(key);
  }
}

export function rateLimit({
  windowMs = 60_000,
  max = 60,
  name = 'requests',
}: { windowMs?: number; max?: number; name?: string } = {}) {
  return function limiter(req: AuthRequest, res: Response, next: NextFunction): void {
    const now = Date.now();
    sweep(now);

    const key = `${name}:${req.userId ?? req.ip ?? 'unknown'}`;
    const existing = buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    existing.count += 1;
    if (existing.count > max) {
      const retryAfter = Math.ceil((existing.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({
        error: `Too many ${name}. Wait ${retryAfter} second${retryAfter === 1 ? '' : 's'} and try again.`,
      });
      return;
    }

    next();
  };
}
