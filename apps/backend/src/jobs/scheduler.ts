import cron from 'node-cron';
import type { Pool } from 'pg';
import { detectAnomalies } from '../services/anomalyDetection.js';

/**
 * Scheduled work that runs inside the API process.
 *
 * One process runs this today. If a second backend instance is ever started —
 * which the Redis adapter now makes possible — both would wake at seven and
 * check the same metrics. The unique index on (metric, observed_on) makes that
 * harmless: the second insert updates the first rather than duplicating it, and
 * only the run that actually inserted announces anything. That is a deliberately
 * cheap guard rather than a lock, because the work is idempotent and a missed
 * run matters more than a repeated one.
 *
 * Timezone is pinned. The container runs on UTC, and "seven in the morning"
 * meaning eleven at night locally would be a strange thing to discover later.
 */
const TIMEZONE = 'Asia/Dubai';

export function startScheduledJobs(db: Pool): void {
  // Seven in the morning: after the previous day is complete, and before the
  // nursery opens, so an admin sees the finding when they sit down.
  cron.schedule('0 7 * * *', () => {
    void detectAnomalies(db)
      .then((verdicts) => {
        const found = verdicts.filter((v) => v.status === 'anomaly').length;
        const waiting = verdicts.filter(
          (v) => v.status === 'insufficient_history' || v.status === 'baseline_too_low'
        ).length;
        console.log(
          `anomaly detection: ${found} found, ${waiting} metric(s) still without enough history`
        );
      })
      .catch((error: unknown) => {
        console.error('anomaly detection run failed', error);
      });
  }, { timezone: TIMEZONE });

  console.log(`scheduled jobs started (anomaly detection daily at 07:00 ${TIMEZONE})`);
}
