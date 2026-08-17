import express from 'express';
import type { Response } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { authenticate, createResolveAdmin } from '../../middleware/auth.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { createResolvePermissions, requirePermission, requirePanelAccess } from '../../middleware/permissions.js';
import { logActivity } from '../../utils/activityLog.js';
import { ask, isConfigured, buildSnapshot } from '../../services/aiAssistant.js';

const AskSchema = z.object({
  question: z.string().trim().min(3, 'Ask a question').max(1000, 'Question is too long'),
});

/**
 * A small per-account limit.
 *
 * Held in memory rather than a table: it exists to stop a stuck loop or an
 * impatient click from running up a bill, and losing the counter on restart is
 * not a meaningful hole in that. A shared cap across replicas would need Redis,
 * which this project has deliberately not taken on.
 */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>();

function overLimit(userId: string): number | null {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    // Seconds until the oldest call leaves the window.
    return Math.ceil((WINDOW_MS - (now - recent[0]!)) / 1000);
  }
  recent.push(now);
  hits.set(userId, recent);
  // Keeps the map from growing once accounts stop asking.
  if (hits.size > 500) {
    for (const [key, times] of hits) {
      if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(key);
    }
  }
  return null;
}

async function askAssistant(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { question } = AskSchema.parse(req.body);

    if (!isConfigured()) {
      res.status(503).json({
        error: 'The assistant is not configured. ANTHROPIC_API_KEY is not set on the server.',
      });
      return;
    }

    const retryAfter = overLimit(req.userId ?? 'unknown');
    if (retryAfter !== null) {
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({ error: `Too many questions. Try again in ${retryAfter}s.` });
      return;
    }

    const result = await ask(db, question);

    // Recorded so the cost of this feature is visible in the same place as
    // every other admin action, rather than only on a bill at the end of the
    // month. The question is kept; the answer is not, being reproducible.
    await logActivity(db, req.userId, 'ask', 'assistant', null, {
      newValues: {
        question,
        model: result.model,
        input_tokens: result.usage.input_tokens,
        output_tokens: result.usage.output_tokens,
        took_ms: result.took_ms,
      },
      req,
    });

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues[0]?.message ?? 'Invalid question' });
      return;
    }
    // Anthropic's SDK throws typed errors; the status is worth passing through
    // so a rate limit upstream does not read as a bug in this panel.
    const status = (error as { status?: number }).status;
    if (status === 429) { res.status(429).json({ error: 'The model is rate limited. Try again shortly.' }); return; }
    if (status === 401) { res.status(503).json({ error: 'The configured API key was rejected.' }); return; }

    console.error('askAssistant failed', error);
    res.status(500).json({ error: 'The assistant could not answer that.' });
  }
}

/** The same figures the assistant sees, so an admin can check its working. */
async function getSnapshot(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    res.json({ configured: isConfigured(), snapshot: await buildSnapshot(db) });
  } catch (error) {
    console.error('getSnapshot failed', error);
    res.status(500).json({ error: 'Failed to gather the figures' });
  }
}

export function createAdminAssistantRouter(db: Pool): express.Router {
  const router = express.Router();
  const resolveAdmin = createResolveAdmin(db);

  router.use(authenticate, resolveAdmin, createResolvePermissions(db), requirePanelAccess);

  // Reading the panel's own figures is the analytics permission; the assistant
  // sees nothing an account with that permission could not already read.
  router.get('/snapshot', requirePermission('view:analytics'), (req, res) => getSnapshot(db, req as AuthRequest, res));
  router.post('/ask', requirePermission('view:analytics'), (req, res) => askAssistant(db, req as AuthRequest, res));

  return router;
}
