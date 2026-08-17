'use client';

import { useEffect, useState } from 'react';
import { EChart } from './EChart';
import { api } from '../../../lib/api';

/**
 * Visitors grouped by the month they first arrived, and how many came back in
 * each month after.
 *
 * A month that has not happened yet for a cohort is blank rather than 0% — a
 * zero would read as everybody leaving, when in fact the month is simply in
 * the future.
 */

interface CohortRow {
  cohort: string;
  size: number;
  /** Retention per month since arrival; null where not yet knowable. */
  cells: Array<number | null>;
}

interface Cohorts {
  months: number;
  measuring_since: string;
  rows: CohortRow[];
}

function monthLabel(cohort: string): string {
  const [y, m] = cohort.split('-').map(Number);
  return new Date(y ?? 2026, (m ?? 1) - 1, 1)
    .toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

export function CohortHeatmap({ months = 6 }: { months?: number }) {
  const [data, setData] = useState<Cohorts | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<Cohorts>('/admin/analytics/cohorts', { params: { months } })
      .then((res) => { if (!cancelled) setData(res); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed'); });
    return () => { cancelled = true; };
  }, [months]);

  if (error) return <p className="p-6 text-sm text-red-400">{error}</p>;
  if (!data) return <div className="h-75 animate-pulse rounded-xl bg-zinc-800/40" />;

  // [x, y, value] triples; nulls are left out so ECharts draws a gap.
  const points: Array<[number, number, number]> = [];
  data.rows.forEach((row, y) => {
    row.cells.forEach((value, x) => {
      if (value !== null) points.push([x, y, value]);
    });
  });

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">
        Grouped by the month a visitor first arrived, counting from{' '}
        {new Date(data.measuring_since).toLocaleDateString()}. Blank cells are months
        that have not happened yet for that cohort.
      </p>

      {points.length === 0 ? (
        <p className="rounded-lg border border-zinc-800 bg-[#0c0c14] p-6 text-center text-sm text-zinc-500">
          No cohort has completed a month yet. The first row fills once this month
          ends and its visitors have had a chance to return.
        </p>
      ) : (
        <EChart
          ariaLabel="Retention by month of first visit, as a heatmap of cohorts against months since arrival"
          height={Math.max(220, data.rows.length * 48 + 100)}
          option={{
            tooltip: {
              formatter: (params: unknown) => {
                const p = params as { data: [number, number, number] };
                const row = data.rows[p.data[1]];
                if (!row) return '';
                return `${monthLabel(row.cohort)} · month ${p.data[0]}`
                  + `<br/>${p.data[2]}% of ${row.size} came back`;
              },
            },
            grid: { left: 90, right: 24, top: 30, bottom: 50 },
            xAxis: {
              type: 'category',
              data: Array.from({ length: data.months }, (_, i) => `Month ${i}`),
              splitArea: { show: true },
              axisLabel: { color: '#a1a1aa' },
            },
            yAxis: {
              type: 'category',
              data: data.rows.map((r) => `${monthLabel(r.cohort)} (${r.size})`),
              splitArea: { show: true },
              axisLabel: { color: '#a1a1aa' },
            },
            visualMap: {
              min: 0,
              max: 100,
              calculable: true,
              orient: 'horizontal',
              left: 'center',
              bottom: 0,
              textStyle: { color: '#a1a1aa' },
              inRange: { color: ['#1e293b', '#0f766e', '#10b981', '#6ee7b7'] },
            },
            series: [{
              type: 'heatmap',
              data: points,
              label: {
                show: true,
                // ECharts types the callback against its own generic params
                // shape, so the tuple is read back off `data` rather than
                // destructured into a narrower signature.
                formatter: (params: { data?: unknown }) => {
                  const cell = params.data as [number, number, number] | undefined;
                  return cell ? `${cell[2]}%` : '';
                },
                color: '#e4e4e7',
              },
              emphasis: { itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.4)' } },
            }],
          }}
        />
      )}
    </div>
  );
}
