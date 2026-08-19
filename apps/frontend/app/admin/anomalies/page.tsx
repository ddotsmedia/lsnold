'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { DataTable } from '../../../components/admin/DataTable';
import type { Column } from '../../../components/admin/DataTable';
import { Button, Toast } from '../../../components/admin/shared';

/**
 * Days the detector thought did not look like the days before them.
 *
 * The verdicts panel is the more useful half while the nursery is new: an empty
 * table could mean nothing unusual happened, or that a metric has too little
 * history to judge at all, and those are very different. The detector reports
 * which, so the screen shows it rather than leaving a blank table to imply all
 * is well.
 */

interface Anomaly {
  id: string;
  metric: string;
  observed_on: string;
  expected_value: string | number;
  actual_value: string | number;
  score: string | number;
  direction: 'above' | 'below';
  severity: 'low' | 'medium' | 'high';
  sample_days: number;
  acknowledged_at: string | null;
  acknowledged_by_name: string | null;
  created_at: string;
}

type Verdict =
  | { metric: string; status: 'insufficient_history'; days: number }
  | { metric: string; status: 'baseline_too_low'; baseline: number }
  | { metric: string; status: 'normal'; baseline: number; actual: number; score: number }
  | { metric: string; status: 'anomaly'; baseline: number; actual: number; score: number };

type Filter = 'all' | 'open' | 'high' | 'medium' | 'low';

const METRIC_LABELS: Record<string, string> = {
  daily_bookings: 'Tour bookings',
  daily_registrations: 'Registrations',
  daily_page_views: 'Page views',
};

const SEVERITY_STYLES: Record<string, string> = {
  high: 'bg-red-500/15 text-red-300 border-red-500/40',
  medium: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  low: 'bg-blue-500/15 text-blue-300 border-blue-500/40',
};

/** Plain English for why a metric is silent. */
function explainVerdict(v: Verdict): string {
  switch (v.status) {
    case 'insufficient_history':
      return `only ${v.days} day${v.days === 1 ? '' : 's'} of history so far`;
    case 'baseline_too_low':
      return `averaging ${v.baseline} a day — too few to tell a change from ordinary variation`;
    case 'normal':
      return `around ${v.baseline} a day, ${v.actual} yesterday — nothing unusual`;
    case 'anomaly':
      return `${v.actual} against a usual ${v.baseline}`;
  }
}

export default function AnomaliesPage() {
  const [rows, setRows] = useState<Anomaly[]>([]);
  const [verdicts, setVerdicts] = useState<Verdict[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Severity is filtered here rather than server-side: the endpoint caps at
      // 200 rows and a nursery will not produce enough findings for that to
      // matter, so one request serves every tab.
      const res = await api<{ data: Anomaly[] }>('/admin/anomalies', {
        params: { limit: 200, open: filter === 'open' ? 'true' : undefined },
      });
      setRows(res.data);
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Could not load', type: 'error' });
    } finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    api<{ verdicts: Verdict[] }>('/admin/anomalies/preview')
      .then((res) => setVerdicts(res.verdicts))
      .catch(() => setVerdicts(null));
  }, []);

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); }
  }, [toast]);

  const acknowledge = async (id: string) => {
    // Optimistic: the row stays visible, just marked, so the table does not
    // jump under the pointer mid-review.
    const stamp = new Date().toISOString();
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, acknowledged_at: stamp } : r)));
    try {
      await api(`/admin/anomalies/${id}/acknowledge`, { method: 'POST' });
      setToast({ message: 'Marked as seen', type: 'success' });
    } catch (err) {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, acknowledged_at: null } : r)));
      setToast({ message: err instanceof Error ? err.message : 'Could not acknowledge', type: 'error' });
    }
  };

  const runNow = async () => {
    setBusy(true);
    try {
      const res = await api<{ verdicts: Verdict[] }>('/admin/anomalies/run', { method: 'POST' });
      setVerdicts(res.verdicts);
      const found = res.verdicts.filter((v) => v.status === 'anomaly').length;
      setToast({
        message: found > 0 ? `${found} found` : 'Checked — nothing unusual',
        type: 'success',
      });
      await load();
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Could not run', type: 'error' });
    } finally { setBusy(false); }
  };

  const shown = filter === 'all' || filter === 'open'
    ? rows
    : rows.filter((r) => r.severity === filter);

  const openCount = rows.filter((r) => r.acknowledged_at === null).length;

  const columns: Column<Anomaly>[] = [
    {
      key: 'metric', header: 'Metric',
      render: (r) => <span className="font-medium">{METRIC_LABELS[r.metric] ?? r.metric}</span>,
    },
    {
      key: 'observed_on', header: 'Day',
      render: (r) => (
        <span className="text-xs tabular-nums text-panel-muted">
          {new Date(r.observed_on).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'actual_value', header: 'Count',
      render: (r) => (
        <span className="tabular-nums">
          <span className="font-semibold">{Number(r.actual_value)}</span>
          <span className="text-panel-muted"> vs {Number(r.expected_value)} usual</span>
        </span>
      ),
    },
    {
      key: 'direction', header: 'Change',
      render: (r) => {
        const expected = Number(r.expected_value);
        const actual = Number(r.actual_value);
        // The detector never records a finding on a baseline under three, so a
        // divide here is safe — but guarded anyway, since a stray zero would
        // otherwise render as Infinity%.
        const pct = expected > 0 ? Math.round((actual / expected - 1) * 100) : null;
        return (
          <span className={r.direction === 'above' ? 'text-amber-300' : 'text-blue-300'}>
            {r.direction === 'above' ? '▲' : '▼'}{' '}
            {pct === null ? r.direction : `${Math.abs(pct)}% ${r.direction}`}
          </span>
        );
      },
    },
    {
      key: 'severity', header: 'Severity',
      render: (r) => (
        <span className={`rounded-full border px-2 py-0.5 text-[11px] capitalize ${SEVERITY_STYLES[r.severity] ?? ''}`}>
          {r.severity}
        </span>
      ),
    },
    {
      key: 'acknowledged_at', header: 'Seen',
      render: (r) => (r.acknowledged_at ? (
        <span className="text-xs text-emerald-400">
          Seen{r.acknowledged_by_name ? ` by ${r.acknowledged_by_name}` : ''}
        </span>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => void acknowledge(r.id)}>
          Mark seen
        </Button>
      )),
    },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-panel-strong">Anomalies</h1>
          <p className="mt-1 text-sm text-panel-muted">
            Days that did not look like the days before them. Checked every morning at 07:00.
          </p>
        </div>
        <Button variant="secondary" onClick={() => void runNow()} disabled={busy}>
          {busy ? 'Checking…' : 'Check now'}
        </Button>
      </header>

      {/* What each metric would say right now — the reason a table can be empty
          without that meaning everything is fine. */}
      {verdicts && (
        <section className="rounded-xl border border-panel-line/50 bg-panel-surface p-4">
          <h2 className="mb-2 text-sm font-medium text-panel-body">Where each metric stands</h2>
          <ul className="space-y-1.5">
            {verdicts.map((v) => (
              <li key={v.metric} className="flex flex-wrap items-baseline gap-2 text-sm">
                <span className="w-36 shrink-0 text-panel-body">
                  {METRIC_LABELS[v.metric] ?? v.metric}
                </span>
                <span
                  className={`rounded px-1.5 text-[11px] ${
                    v.status === 'anomaly'
                      ? 'bg-amber-500/15 text-amber-300'
                      : v.status === 'normal'
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-panel-raised text-panel-muted'
                  }`}
                >
                  {v.status === 'anomaly' ? 'unusual'
                    : v.status === 'normal' ? 'normal' : 'not enough data'}
                </span>
                <span className="text-panel-muted">{explainVerdict(v)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap gap-1">
        {(['all', 'open', 'high', 'medium', 'low'] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            aria-current={filter === key ? 'true' : undefined}
            className={`min-h-11 rounded-lg px-3 text-sm capitalize transition-colors ${
              filter === key
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'text-panel-muted hover:bg-panel-raised/40 hover:text-panel-body'
            }`}
          >
            {key === 'open' ? `Not yet seen${openCount ? ` (${openCount})` : ''}` : key}
          </button>
        ))}
      </div>

      <DataTable<Anomaly>
        columns={columns}
        data={shown}
        loading={loading}
        emptyMessage={
          filter === 'all'
            ? 'Nothing unusual has been recorded. The panel above says whether that is because everything is steady, or because a metric has too little history to judge yet.'
            : 'Nothing matches this filter.'
        }
      />

      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}
