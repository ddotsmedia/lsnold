'use client';

import { useEffect, useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import { api } from '../../../lib/api';
import { EChart, AXIS_STYLE, TOOLTIP_STYLE } from './EChart';

/**
 * When families visit the site, by weekday and hour.
 *
 * This is not the class-capacity heatmap originally asked for. Nothing in this
 * database records a class roll or a room capacity — age_groups has no capacity
 * column and there is no schedule or slot table — so that chart could only have
 * been drawn from invented numbers. This uses traffic that is actually
 * recorded, and answers something the nursery can act on: when to be reachable,
 * and when a post will be seen.
 */

interface Cell { weekday: number; hour: number; visits: number }
interface HeatmapData { days: number; peak: number; cells: Cell[] }

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}`);

export function VisitHeatmap({ days = 30 }: { days?: number }) {
  const [data, setData] = useState<HeatmapData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<HeatmapData>('/admin/analytics/heatmap', { params: { days } })
      .then((res) => { if (!cancelled) setData(res); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [days]);

  const option = useMemo<EChartsOption>(() => {
    if (!data) return {};
    return {
      grid: { left: 44, right: 16, top: 12, bottom: 56 },
      tooltip: {
        ...TOOLTIP_STYLE,
        formatter: (params: unknown) => {
          const p = params as { value: [number, number, number] };
          const [hour, day, visits] = p.value;
          return `${DAYS[day]} ${HOURS[hour]}:00 — ${visits} visit${visits === 1 ? '' : 's'}`;
        },
      },
      xAxis: { type: 'category', data: HOURS, splitArea: { show: true }, ...AXIS_STYLE },
      yAxis: { type: 'category', data: DAYS, splitArea: { show: true }, ...AXIS_STYLE },
      visualMap: {
        min: 0,
        // Guarded against a peak of 0, where ECharts would render one flat block.
        max: Math.max(1, data.peak),
        calculable: false,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        textStyle: { color: '#a1a1aa', fontSize: 11 },
        inRange: { color: ['#18181b', '#065f46', '#10b981', '#fbbf24', '#ef4444'] },
      },
      series: [{
        type: 'heatmap',
        data: data.cells.map((c) => [c.hour, c.weekday, c.visits]),
        itemStyle: { borderColor: '#09090b', borderWidth: 1 },
        emphasis: { itemStyle: { borderColor: '#e4e4e7', borderWidth: 1 } },
      }],
    };
  }, [data]);

  if (error) {
    return <Note>Could not load visit times.</Note>;
  }
  if (!data) return <div className="h-70 animate-pulse rounded-lg bg-zinc-800/40" />;
  if (data.cells.length === 0) {
    return <Note>No visits recorded in the last {data.days} days.</Note>;
  }

  return (
    <>
      <EChart option={option} height={280} ariaLabel="Site visits by weekday and hour" />
      <p className="mt-1 text-[11px] text-zinc-600">
        Last {data.days} days. Busiest hour saw {data.peak} visits.
      </p>
    </>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-70 items-center justify-center rounded-lg border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">
      <p>{children}</p>
    </div>
  );
}
