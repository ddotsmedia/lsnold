import express from 'express';
import type { Response } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { authenticate, createResolveAdmin, requireAdmin } from '../../middleware/auth.js';
import { createResolvePermissions, requirePermission, requirePanelAccess } from '../../middleware/permissions.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { logActivity } from '../../utils/activityLog.js';
import { getSummary } from '../../integrations/chatbot-analytics.js';
import type { ChatbotMessage, ConversationWithMessages } from '../../types/chatbot.js';

const CONVERSATION_STATUSES = ['active', 'escalated', 'closed'] as const;

const ReplySchema = z.object({
  message: z.string().trim().min(1, 'Message cannot be empty').max(4000),
});

const IdSchema = z.string().uuid();

/**
 * Lists conversations newest-activity-first, with a message count and a preview
 * of the latest message so the admin list is useful without opening each one.
 */
async function listConversations(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const offset = (page - 1) * limit;
    const status = req.query.status as string | undefined;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (status && (CONVERSATION_STATUSES as readonly string[]).includes(status)) {
      params.push(status);
      conditions.push(`c.status = $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await db.query(
      `SELECT COUNT(*) FROM chatbot_conversations c ${where}`,
      params
    );
    const total = Number(countResult.rows[0]?.count ?? 0);

    const dataResult = await db.query(
      `SELECT c.*,
              COALESCE(m.message_count, 0) AS message_count,
              m.last_message_preview
       FROM chatbot_conversations c
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS message_count,
                (SELECT message FROM chatbot_messages
                  WHERE conversation_id = c.id
                  ORDER BY created_at DESC LIMIT 1) AS last_message_preview
         FROM chatbot_messages WHERE conversation_id = c.id
       ) m ON TRUE
       ${where}
       ORDER BY c.last_message_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({
      data: dataResult.rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('listConversations failed', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
}

async function getConversation(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    if (!IdSchema.safeParse(id).success) {
      res.status(400).json({ error: 'Invalid conversation id' });
      return;
    }

    const conversation = await db.query('SELECT * FROM chatbot_conversations WHERE id = $1', [id]);
    if (conversation.rows.length === 0) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    const messages = await db.query(
      'SELECT * FROM chatbot_messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [id]
    );

    const payload: ConversationWithMessages = {
      ...conversation.rows[0],
      messages: messages.rows as ChatbotMessage[],
    };
    res.json(payload);
  } catch (error) {
    console.error('getConversation (admin) failed', error);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
}

async function closeConversation(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    if (!IdSchema.safeParse(id).success) {
      res.status(400).json({ error: 'Invalid conversation id' });
      return;
    }

    const result = await db.query(
      `UPDATE chatbot_conversations SET status = 'closed' WHERE id = $1 RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    await logActivity(db, req.userId, 'status_change', 'chatbot_conversation', id, {
      newStatus: 'closed',
    });

    res.json(result.rows[0]);
  } catch (error) {
    console.error('closeConversation failed', error);
    res.status(500).json({ error: 'Failed to close conversation' });
  }
}

/**
 * Posts a human reply into the thread. Replying to an escalated conversation
 * moves it back to active — the question has been answered, so it should leave
 * the "needs attention" queue.
 */
async function replyToConversation(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    if (!IdSchema.safeParse(id).success) {
      res.status(400).json({ error: 'Invalid conversation id' });
      return;
    }

    const data = ReplySchema.parse(req.body);

    const conversation = await db.query(
      'SELECT id, status FROM chatbot_conversations WHERE id = $1',
      [id]
    );
    if (conversation.rows.length === 0) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }
    if ((conversation.rows[0] as { status: string }).status === 'closed') {
      res.status(409).json({ error: 'Cannot reply to a closed conversation' });
      return;
    }

    const inserted = await db.query(
      `INSERT INTO chatbot_messages (conversation_id, sender, message)
       VALUES ($1, 'admin', $2) RETURNING *`,
      [id, data.message]
    );

    await db.query(
      `UPDATE chatbot_conversations
       SET last_message_at = CURRENT_TIMESTAMP,
           status = CASE WHEN status = 'escalated' THEN 'active' ELSE status END
       WHERE id = $1`,
      [id]
    );

    await logActivity(db, req.userId, 'create', 'chatbot_message', id);

    res.status(201).json(inserted.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.issues });
      return;
    }
    console.error('replyToConversation failed', error);
    res.status(500).json({ error: 'Failed to send reply' });
  }
}

/**
 * Appointment requests captured by the bot. Without this the table would be
 * written to and never read, which is how callback requests get lost.
 */
async function listAppointmentRequests(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const status = req.query.status as string | undefined;
    const allowed = ['pending', 'contacted', 'scheduled', 'cancelled'];
    const params: unknown[] = [];
    let where = '';

    if (status && allowed.includes(status)) {
      params.push(status);
      where = `WHERE status = $${params.length}`;
    }

    const result = await db.query(
      `SELECT * FROM chatbot_appointment_requests ${where} ORDER BY created_at DESC LIMIT 200`,
      params
    );
    res.json({ data: result.rows });
  } catch (error) {
    console.error('listAppointmentRequests failed', error);
    res.status(500).json({ error: 'Failed to fetch appointment requests' });
  }
}

async function getAnalytics(db: Pool, req: AuthRequest, res: Response): Promise<void> {
  try {
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
    res.json(await getSummary(db, days));
  } catch (error) {
    console.error('getAnalytics failed', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
}

export function createAdminChatbotRouter(db: Pool): express.Router {
  const router = express.Router();
  const resolveAdmin = createResolveAdmin(db);

  router.use(authenticate, resolveAdmin, createResolvePermissions(db), requirePanelAccess);

  router.get('/conversations', requirePermission('view:chatbot'), (req, res) => listConversations(db, req as AuthRequest, res));
  router.get('/conversations/:id', requirePermission('view:chatbot'), (req, res) => getConversation(db, req as AuthRequest, res));
  router.patch('/conversations/:id/close', requirePermission('manage:chatbot'), (req, res) =>
    closeConversation(db, req as AuthRequest, res)
  );
  router.post('/conversations/:id/message', requirePermission('manage:chatbot'), (req, res) =>
    replyToConversation(db, req as AuthRequest, res)
  );
  router.get('/appointments', requirePermission('view:chatbot'), (req, res) => listAppointmentRequests(db, req as AuthRequest, res));
  router.get('/analytics', requirePermission('view:chatbot'), (req, res) => getAnalytics(db, req as AuthRequest, res));

  return router;
}
