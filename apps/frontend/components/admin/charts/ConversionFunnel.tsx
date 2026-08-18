'use client';

import { useEffect, useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import { api } from '../../../lib/api';
import { EChart, AXIS_STYLE, TOOLTIP_STYLE } from './EChart';

/**
 * Visitors -> tour bookings -> registrations.
 *
 * Drawn as horizontal bars rather than ECharts' funnel series: a funnel shape
 * sizes its segments by proportion, and with a few hundred visitors against a
 * handful of bookings the lower segments collapse to slivers nobody can read.
 * Bars stay legible at any ratio, and the drop-off is printed as a number
 * rather than left to be judged by eye.
 */

interface Stage { stage: string; count: number; conversion: number | null }
interface Funnel { days: number; stages: Stage[] }

export function ConversionFunnel({ days = 30 }: { days?: number }) {
  const [data, setData] = useState<Funnel | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<Funnel>('/admin/analytics/funnel', { params: { days } })
      .then((res) => { if (!cancelled) setData(res); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [days]);

  const option = useMemo<EChartsOption>(() => {
    if (!data) return {};
    return {
      grid: { left: 96, right: 40, top: 8, bottom: 8 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, ...TOOLTIP_STYLE },
      xAxis: { type: 'value', minInterval: 1, ...AXIS_STYLE },
      // Reversed so the first stage sits at the top, which is how the journey
      // reads.
      yAxis: {
        type: 'category',
        data: [...data.stages].reverse().map((s) => s.stage),
        ...AXIS_STYLE,
      },
      series: [{
        type: 'bar',
        data: [...data.stages].reverse().map((s, i, arr) => ({
          value: s.count,
          itemStyle: { color: ['#34d399', '#38bdf8', '#a78bfa'][arr.length - 1 - i] },
        })),
        barWidth: '55%',
        label: { show: true, position: 'right', color: '#a1a1aa', fontSize: 11 },
      }],
    };
  }, [data]);

  if (error) return <Note>Could not load the funnel.</Note>;
  if (!data) return <div className="h-50 animate-pulse rounded-lg bg-panel-raised/40" />;

  return (
    <>
      <EChart option={option} height={200} ariaLabel="Visitor to registration funnel" />
      <ul className="mt-2 space-y-1">
        {data.stages.slice(1).map((stage, index) => (
          <li key={stage.stage} className="flex justify-between text-[11px] text-panel-muted">
            <span>{data.stages[index]!.stage} → {stage.stage}</span>
            <span className={stage.conversion === null ? 'text-panel-faint' : 'text-panel-body'}>
              {stage.conversion === null ? 'no data' : `${stage.conversion}%`}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[11px] text-panel-faint">Last {data.days} days.</p>
    </>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-50 items-center justify-center rounded-lg border border-dashed border-panel-line p-6 text-center text-sm text-panel-muted">
      <p>{children}</p>
    </div>
  );
}
