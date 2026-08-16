'use client';

import { useEffect, useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import { api } from '../../../lib/api';
import { EChart, AXIS_STYLE, TOOLTIP_STYLE } from './EChart';

/**
 * Registrations per day, with a straight-line projection ahead.
 *
 * The projection is drawn dashed and labelled, and the server withholds it
 * entirely until there are enough days that actually carry a registration. With
 * nothing to go on the chart says so rather than drawing a confident line
 * through an empty series.
 */

interface Point { date: string; count: number }

interface Forecast {
  history: Point[];
  forecast: Point[];
  status: 'ok' | 'insufficient_data';
  observed_days: number;
  required_days?: number;
  slope_per_day?: number;
}

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export function EnrollmentTrendChart({ days = 90, ahead = 30 }: { days?: number; ahead?: number }) {
  const [data, setData] = useState<Forecast | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<Forecast>('/admin/analytics/forecast', { params: { days, ahead } })
      .then((res) => { if (!cancelled) setData(res); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [days, ahead]);

  const option = useMemo<EChartsOption>(() => {
    if (!data) return {};
    const labels = [...data.history.map((p) => p.date), ...data.forecast.map((p) => p.date)];
    const actual = [
      ...data.history.map((p) => p.count),
      // Nulls keep the solid line from running under the projection.
      ...data.forecast.map(() => null),
    ];
    // Repeats the last real value so the dashed line starts where the solid
    // one ends instead of floating away from it.
    const projected = [
      ...data.history.slice(0, -1).map(() => null),
      data.history.at(-1)?.count ?? null,
      ...data.forecast.map((p) => p.count),
    ];

    return {
      grid: { left: 40, right: 16, top: 28, bottom: 28 },
      tooltip: { trigger: 'axis', ...TOOLTIP_STYLE },
      legend: { data: ['Registrations', 'Projection'], textStyle: { color: '#a1a1aa' }, top: 0 },
      xAxis: { type: 'category', data: labels.map(shortDate), boundaryGap: false, ...AXIS_STYLE },
      yAxis: { type: 'value', minInterval: 1, ...AXIS_STYLE },
      series: [
        {
          name: 'Registrations', type: 'line', data: actual, smooth: true,
          showSymbol: false, lineStyle: { width: 2, color: '#34d399' },
          areaStyle: { color: 'rgba(52, 211, 153, 0.12)' },
        },
        {
          name: 'Projection', type: 'line', data: projected, smooth: true,
          showSymbol: false, lineStyle: { width: 2, type: 'dashed', color: '#fbbf24' },
        },
      ],
    };
  }, [data]);

  if (error) return <ChartNote>Could not load the registration trend.</ChartNote>;
  if (!data) return <div className="h-70 animate-pulse rounded-lg bg-zinc-800/40" />;

  if (data.status === 'insufficient_data') {
    return (
      <ChartNote>
        Not enough history to project yet — {data.observed_days} of{' '}
        {data.required_days ?? 7} days with a registration.
        <span className="mt-1 block text-zinc-600">
          The trend appears here once registrations start arriving.
        </span>
      </ChartNote>
    );
  }

  return (
    <>
      <EChart option={option} height={280} ariaLabel="Registrations per day with projection" />
      <p className="mt-1 text-[11px] text-zinc-600">
        Projection is a straight-line trend, not a forecast model — it knows nothing about term
        dates or campaigns.
      </p>
    </>
  );
}

function ChartNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-70 items-center justify-center rounded-lg border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">
      <p>{children}</p>
    </div>
  );
}
