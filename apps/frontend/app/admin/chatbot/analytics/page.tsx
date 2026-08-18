'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../../lib/api';
import { FilterSelect, Toast } from '../../../../components/admin/shared';

interface Summary {
  total: number;
  matched: number;
  escalated: number;
  hitRate: number;
  byCategory: Array<{ category: string; count: number }>;
  byHour: Array<{ hour: number; count: number }>;
  topUnanswered: Array<{ question: string; count: number }>;
}

const RANGES = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-panel-line/50 bg-panel-sunken p-4">
      <p className="text-xs text-panel-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone ?? 'text-panel-strong'}`}>{value}</p>
    </div>
  );
}

/** Horizontal bars: a chart library would be a new dependency for one view. */
function Bars({ rows }: { rows: Array<{ label: string; count: number }> }) {
  const max = rows.reduce((m, r) => Math.max(m, r.count), 0);
  if (rows.length === 0) return <p className="text-sm text-panel-muted">No data yet.</p>;
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.label} className="flex items-center gap-3">
          <span className="w-28 shrink-0 truncate text-xs text-panel-body">{row.label}</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-panel-raised">
            <span
              className="block h-full rounded-full bg-emerald-500"
              style={{ width: max === 0 ? '0%' : `${Math.round((row.count / max) * 100)}%` }}
            />
          </span>
          <span className="w-8 shrink-0 text-right text-xs text-panel-body">{row.count}</span>
        </li>
      ))}
    </ul>
  );
}

export default function ChatbotAnalyticsPage() {
  const [days, setDays] = useState('30');
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api<Summary>('/admin/chatbot/analytics', { params: { days } }));
    } catch {
      setToast({ message: 'Failed to load analytics', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div className="p-6">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-panel-strong">Chatbot analytics</h1>
          <p className="mt-1 text-sm text-panel-muted">
            Every question asked, whether the bot answered it, and what it could not.
          </p>
        </div>
        <div className="w-40">
          <FilterSelect value={days} onChange={setDays} options={RANGES} />
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-panel-muted">Loading…</p>
      ) : !data ? (
        <p className="text-sm text-panel-muted">No data.</p>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Questions asked" value={String(data.total)} />
            <Stat label="Answered by bot" value={String(data.matched)} tone="text-emerald-400" />
            <Stat label="Escalated" value={String(data.escalated)} tone="text-red-400" />
            <Stat label="Hit rate" value={`${data.hitRate}%`} tone="text-emerald-400" />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-panel-line/50 bg-panel-sunken p-4">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-panel-body">
                By category
              </h2>
              <Bars rows={data.byCategory.map((c) => ({ label: c.category, count: c.count }))} />
            </section>

            <section className="rounded-xl border border-panel-line/50 bg-panel-sunken p-4">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-panel-body">
                Busiest hours
              </h2>
              <Bars
                rows={data.byHour.map((h) => ({
                  label: `${String(h.hour).padStart(2, '0')}:00`,
                  count: h.count,
                }))}
              />
            </section>

            <section className="rounded-xl border border-panel-line/50 bg-panel-sunken p-4 lg:col-span-2">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-panel-body">
                Unanswered questions
              </h2>
              <p className="mb-4 text-xs text-panel-muted">
                Each of these is a candidate for a new FAQ entry.
              </p>
              {data.topUnanswered.length === 0 ? (
                <p className="text-sm text-panel-muted">Nothing unanswered in this period.</p>
              ) : (
                <ul className="divide-y divide-panel-line/50">
                  {data.topUnanswered.map((q) => (
                    <li key={q.question} className="flex items-center justify-between gap-4 py-2">
                      <span className="truncate text-sm text-panel-body">{q.question}</span>
                      <span className="shrink-0 rounded-full bg-panel-raised px-2 py-0.5 text-xs text-panel-body">
                        {q.count}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}

      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}
