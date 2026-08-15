import { Pool } from 'pg';

/**
 * Moves a due schedule into published_at.
 *
 * This does NOT control whether a section is visible. The public query already
 * treats a section whose scheduled_publish_at has passed as live, so content
 * goes up on time whether or not this ever runs — a job that dies must not mean
 * content silently never publishes.
 *
 * What it does is keep the record honest: after it runs, published_at says when
 * the section actually went live, and scheduled_publish_at is cleared, so the
 * admin screen shows "Published" rather than "Scheduled" for something that is
 * already on the site.
 *
 * Run it as often or as rarely as suits; it is idempotent.
 *
 *   docker compose exec backend node dist/scripts/publishScheduledSections.js
 */

export async function publishScheduledSections(db: Pool): Promise<number> {
  const result = await db.query(
    `UPDATE page_content_sections
        SET published_at = scheduled_publish_at,
            scheduled_publish_at = NULL
      WHERE deleted_at IS NULL
        AND published_at IS NULL
        AND scheduled_publish_at IS NOT NULL
        AND scheduled_publish_at <= NOW()
      RETURNING id, section_key, published_at`
  );

  for (const row of result.rows as Array<{ section_key: string; published_at: Date }>) {
    console.log(`published section '${row.section_key}' (due ${row.published_at.toISOString()})`);
  }
  return result.rowCount ?? 0;
}

/** Only connects when run directly, so importing this file costs nothing. */
async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set');
    process.exitCode = 1;
    return;
  }

  const db = new Pool({ connectionString });
  try {
    const count = await publishScheduledSections(db);
    console.log(count === 0 ? 'nothing due' : `${count} section(s) published`);
  } catch (error) {
    console.error('publishScheduledSections failed', error);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

// Guarded so the export stays importable from a test or another script.
if (process.argv[1]?.endsWith('publishScheduledSections.js')) {
  void main();
}
