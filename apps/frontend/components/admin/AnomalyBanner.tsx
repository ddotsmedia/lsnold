'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { banner } from '../../lib/animations';
import { useRealtimeEvent } from '../../lib/realtime';
import { api } from '../../lib/api';

/**
 * Says so on the dashboard when a day looked wrong.
 *
 * Two sources, because either alone would be misleading. The socket catches a
 * finding raised while somebody is looking; the fetch on mount catches one
 * raised at seven this morning, before anyone opened the panel. Without the
 * fetch the banner would only ever fire for whoever happened to be watching.
 *
 * It does not auto-dismiss. The brief hides it after fifteen seconds, which
 * means a finding raised while the tab sat in the background is gone before
 * anyone reads it — and this is the one thing on the dashboard that is meant to
 * interrupt. It stays until marked seen, which also settles it for every other
 * admin rather than just this browser.
 */

interface Alert {
  id: string;
  metric: string;
  observed_on: string;
  expected: number | string;
  actual: number | string;
  direction: 'above' | 'below';
  severity: 'low' | 'medium' | 'high';
}

interface StoredAnomaly {
  id: string;
  metric: string;
  observed_on: string;
  expected_value: string | number;
  actual_value: string | number;
  direction: 'above' | 'below';
  severity: 'low' | 'medium' | 'high';
  acknowledged_at: string | null;
}

const METRIC_LABELS: Record<string, string> = {
  daily_bookings: 'Tour bookings',
  daily_registrations: 'Registrations',
  daily_page_views: 'Page views',
};

export function AnomalyBanner() {
  const [alert, setAlert] = useState<Alert | null>(null);
  const [dismissing, setDismissing] = useState(false);

  // Anything still unacknowledged, most severe first, on load.
  useEffect(() => {
    let cancelled = false;
    api<{ data: StoredAnomaly[] }>('/admin/anomalies', { params: { open: 'true', limit: 20 } })
      .then((res) => {
        if (cancelled) return;
        const rank = { high: 0, medium: 1, low: 2 } as const;
        const worst = [...res.data]
          .filter((a) => a.acknowledged_at === null)
          .sort((a, b) => rank[a.severity] - rank[b.severity])[0];
        if (worst) {
          setAlert({
            id: worst.id,
            metric: worst.metric,
            observed_on: worst.observed_on,
            expected: worst.expected_value,
            actual: worst.actual_value,
            direction: worst.direction,
            severity: worst.severity,
          });
        }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  // And anything raised while the page is open.
  useRealtimeEvent<Alert>('anomaly:detected', (incoming) => {
    // A low finding should not replace a high one already on screen.
    const rank = { high: 0, medium: 1, low: 2 } as const;
    setAlert((current) =>
      current && rank[current.severity] <= rank[incoming.severity] ? current : incoming
    );
  });


  const markSeen = async (id: string) => {
    setDismissing(true);
    try {
      await api(`/admin/anomalies/${id}/acknowledge`, { method: 'POST' });
      setAlert(null);
    } catch {
      // Left on screen rather than hidden: a banner that vanishes without the
      // server agreeing would come back on the next load and look like a bug.
      setDismissing(false);
    }
  };

  return (
    // AnimatePresence so it can be seen leaving when marked seen, rather than
    // blinking out of the layout.
    <AnimatePresence>
      {alert && (
        <BannerBody
          alert={alert}
          dismissing={dismissing}
          onMarkSeen={() => void markSeen(alert.id)}
        />
      )}
    </AnimatePresence>
  );
}

/** Split out so every field can assume the alert exists. */
function BannerBody({
  alert,
  dismissing,
  onMarkSeen,
}: {
  alert: Alert;
  dismissing: boolean;
  onMarkSeen: () => void;
}) {
  const high = alert.severity === 'high';
  const expected = Number(alert.expected);
  const actual = Number(alert.actual);
  const pct = expected > 0 ? Math.round((actual / expected - 1) * 100) : null;

  return (
    <motion.div
      variants={banner}
      initial="hidden"
      animate="visible"
      exit="exit"
      role="status"
      className={`rounded-xl border-l-4 p-4 ${
        high
          ? 'border-red-500 bg-red-500/10 text-red-100'
          : 'border-amber-500 bg-amber-500/10 text-amber-100'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">
            {METRIC_LABELS[alert.metric] ?? alert.metric} were unusually{' '}
            {alert.direction === 'above' ? 'high' : 'low'} on{' '}
            {new Date(alert.observed_on).toLocaleDateString()}
          </p>
          <p className="mt-1 text-sm opacity-90">
            {actual} against a usual {expected}
            {pct === null ? '' : ` — ${Math.abs(pct)}% ${alert.direction}`}.
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          <Link
            href="/admin/anomalies"
            className="flex min-h-11 items-center rounded-lg bg-white/15 px-3 text-sm hover:bg-white/25"
          >
            See all
          </Link>
          <button
            type="button"
            onClick={onMarkSeen}
            disabled={dismissing}
            className="min-h-11 rounded-lg bg-white/15 px-3 text-sm hover:bg-white/25 disabled:opacity-50"
          >
            {dismissing ? 'Saving…' : 'Mark seen'}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
