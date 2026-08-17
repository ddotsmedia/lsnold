import Anthropic from '@anthropic-ai/sdk';
import type { Pool } from 'pg';

/**
 * Answers questions about the nursery's own figures.
 *
 * The assistant is given **aggregate statistics only** — counts, rates and
 * breakdowns. No child's name, date of birth, parent's email or phone ever
 * leaves this server. That is a deliberate limit rather than an oversight: the
 * questions this is for ("how are registrations tracking", "what happened
 * today") are answered from totals, and sending a nursery's family records to a
 * third party is a decision for the owner to take knowingly, not one to be
 * inherited from a feature request.
 *
 * It is therefore honest about what it cannot do. Asked to list a particular
 * family, it will say it only has totals — which is the correct answer, not a
 * failure.
 */

const MODEL = 'claude-haiku-4-5';

/** Every figure the assistant is allowed to see. */
export interface Snapshot {
  generated_at: string;
  registrations: { total: number; by_status: Record<string, number>; last_30_days: number };
  bookings: { total: number; by_status: Record<string, number>; last_30_days: number; upcoming: number };
  traffic: { page_views_30d: number; visitors_30d: number; top_pages: Array<{ path: string; views: number }> };
  content: { pages: number; sections: number; published_sections: number; events: number; media: number };
  activity: { last_7_days: number; by_action: Record<string, number> };
  /** Things the database genuinely cannot answer, told to the model up front. */
  unavailable: string[];
}

function tally(rows: Array<Record<string, unknown>>, key: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) out[String(row[key])] = Number(row.count);
  return out;
}

/** Gathers the figures in one pass, so the answer is internally consistent. */
export async function buildSnapshot(db: Pool): Promise<Snapshot> {
  const [regs, regStatus, books, bookStatus, upcoming, traffic, pages, content, acts, actKinds] =
    await Promise.all([
      db.query(`SELECT COUNT(*)::int AS total,
                       COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::int AS recent
                  FROM registrations WHERE deleted_at IS NULL`),
      db.query(`SELECT status, COUNT(*)::int FROM registrations WHERE deleted_at IS NULL GROUP BY status`),
      db.query(`SELECT COUNT(*)::int AS total,
                       COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::int AS recent
                  FROM tour_bookings WHERE deleted_at IS NULL`),
      db.query(`SELECT status, COUNT(*)::int FROM tour_bookings WHERE deleted_at IS NULL GROUP BY status`),
      db.query(`SELECT COUNT(*)::int AS n FROM tour_bookings
                 WHERE deleted_at IS NULL AND preferred_date >= CURRENT_DATE AND status <> 'cancelled'`),
      db.query(`SELECT COUNT(*)::int AS views,
                       COUNT(DISTINCT COALESCE(visitor_id, session_id))::int AS visitors
                  FROM page_analytics WHERE created_at > NOW() - INTERVAL '30 days'`),
      db.query(`SELECT page_path AS path, COUNT(*)::int AS views FROM page_analytics
                 WHERE created_at > NOW() - INTERVAL '30 days'
                 GROUP BY page_path ORDER BY views DESC LIMIT 8`),
      db.query(`SELECT
          (SELECT COUNT(*)::int FROM pages WHERE deleted_at IS NULL) AS pages,
          (SELECT COUNT(*)::int FROM page_content_sections WHERE deleted_at IS NULL) AS sections,
          (SELECT COUNT(*)::int FROM page_content_sections
            WHERE deleted_at IS NULL AND COALESCE(published_at, scheduled_publish_at) <= NOW()) AS published,
          (SELECT COUNT(*)::int FROM news_events WHERE deleted_at IS NULL) AS events,
          (SELECT COUNT(*)::int FROM media WHERE deleted_at IS NULL) AS media`),
      db.query(`SELECT COUNT(*)::int AS n FROM admin_activity_log
                 WHERE created_at > NOW() - INTERVAL '7 days'`),
      db.query(`SELECT action, COUNT(*)::int FROM admin_activity_log
                 WHERE created_at > NOW() - INTERVAL '7 days' GROUP BY action`),
    ]);

  const c = content.rows[0] as Record<string, number>;

  return {
    generated_at: new Date().toISOString(),
    registrations: {
      total: (regs.rows[0] as { total: number }).total,
      by_status: tally(regStatus.rows, 'status'),
      last_30_days: (regs.rows[0] as { recent: number }).recent,
    },
    bookings: {
      total: (books.rows[0] as { total: number }).total,
      by_status: tally(bookStatus.rows, 'status'),
      last_30_days: (books.rows[0] as { recent: number }).recent,
      upcoming: (upcoming.rows[0] as { n: number }).n,
    },
    traffic: {
      page_views_30d: (traffic.rows[0] as { views: number }).views,
      visitors_30d: (traffic.rows[0] as { visitors: number }).visitors,
      top_pages: pages.rows as Array<{ path: string; views: number }>,
    },
    content: {
      pages: c.pages ?? 0, sections: c.sections ?? 0,
      published_sections: c.published ?? 0, events: c.events ?? 0, media: c.media ?? 0,
    },
    activity: {
      last_7_days: (acts.rows[0] as { n: number }).n,
      by_action: tally(actKinds.rows, 'action'),
    },
    // Stated plainly so the model declines instead of inventing. Every one of
    // these is a real gap in what the nursery records, not a query yet to write.
    unavailable: [
      'Revenue, fees, invoices and payments — the nursery does not record money in this system at all.',
      'Class or room capacity, and which class a child is in — there is no capacity or class field.',
      'Whether a child is still attending in a later month — nothing records attendance or leaving.',
      'Repeat visitors — the visitor id is regenerated daily, so returning visitors cannot be counted.',
      'Any individual family, child or contact detail — you are given totals only, never records.',
    ],
  };
}

const SYSTEM = `You answer questions about a nursery's own admin figures for its staff.

You are given a snapshot of aggregate statistics. Work only from those numbers.

Be brief and concrete. Lead with the answer, then the figures that support it.
Give a number when you have one, and say plainly when you do not.

The snapshot lists what this system does not record. If a question needs one of
those, say so in a sentence and answer whatever part you can from what you have.
Never estimate revenue, capacity or retention — the data does not exist, and a
plausible-looking guess about a nursery's finances is worse than no answer.

You have totals, never individual records, so you cannot look up a named family
or child. Say so if asked.

Small numbers are normal here: this is one nursery, recently launched. Do not
describe a low count as a crisis, and do not read a trend into a handful of rows.`;

export interface Answer {
  answer: string;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
  took_ms: number;
}

export function isConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Asks the question against the snapshot.
 *
 * Fails loudly when unconfigured rather than returning a canned reply — an
 * assistant that silently answers from nothing is worse than one that is
 * plainly switched off.
 */
export async function ask(db: Pool, question: string): Promise<Answer> {
  if (!isConfigured()) {
    throw new Error('The assistant is not configured: ANTHROPIC_API_KEY is not set.');
  }

  const started = Date.now();
  const snapshot = await buildSnapshot(db);
  const client = new Anthropic();

  const message = await client.messages.create({
    model: MODEL,
    // Room for a full answer without inviting an essay; the prompt asks for brevity.
    max_tokens: 2048,
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: `Today's figures:\n\n${JSON.stringify(snapshot, null, 2)}\n\nQuestion: ${question}`,
    }],
  });

  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();

  return {
    answer: text || 'No answer was returned.',
    model: message.model,
    usage: {
      input_tokens: message.usage.input_tokens,
      output_tokens: message.usage.output_tokens,
    },
    took_ms: Date.now() - started,
  };
}
