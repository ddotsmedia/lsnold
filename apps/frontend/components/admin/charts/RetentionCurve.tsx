'use client';

import { useEffect, useState } from 'react';
import { EChart } from './EChart';
import { api } from '../../../lib/api';

/**
 * How many first-time visitors came back, and how long after.
 *
 * A bucket is only counted for visitors who have existed long enough to have
 * reached it, so yesterday's arrivals do not drag the later buckets to zero.
 * Where nobody is old enough yet the rate is null and the point is omitted
 * rather than drawn at 0%.
 */

interface Bucket {
  label: string;
  eligible: number;
  returned: number;
  rate: number | null;
}

interface Retention {
  days: number;
  measuring_since: string;
  buckets: Bucket[];
}

export function RetentionCurve({ days = 90 }: { days?: number }) {
  const [data, setData] = useState<Retention | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<Retention>('/admin/analytics/retention', { params: { days } })
      .then((res) => { if (!cancelled) setData(res); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed'); });
    return () => { cancelled = true; };
  }, [days]);

  if (error) return <p className="p-6 text-sm text-red-400">{error}</p>;
  if (!data) return <div className="h-75 animate-pulse rounded-xl bg-panel-raised/40" />;

  const measured = data.buckets.filter((b) => b.rate !== null);
  const anyEligible = data.buckets.some((b) => b.eligible > 0);

  return (
    <div className="space-y-3">
      <p className="text-xs text-panel-muted">
        Measuring return visits since {new Date(data.measuring_since).toLocaleDateString()}.
        Visitors are only counted towards a bucket once they are old enough to have reached it.
      </p>

      {!anyEligible ? (
        <p className="rounded-lg border border-panel-line bg-panel-sunken p-6 text-center text-sm text-panel-muted">
          Nobody has been tracked long enough yet. The first bucket fills a day after
          the first visit, and the curve builds from there.
        </p>
      ) : (
        <EChart
          ariaLabel="Share of first-time visitors who returned, by how long after their first visit"
          height={320}
          option={{
            tooltip: {
              trigger: 'axis',
              formatter: (params: unknown) => {
                const list = params as Array<{ dataIndex: number }>;
                const bucket = measured[list[0]?.dataIndex ?? 0];
                if (!bucket) return '';
                return `${bucket.label}<br/>${bucket.returned} of ${bucket.eligible} came back`
                  + `<br/><strong>${bucket.rate}%</strong>`;
              },
            },
            grid: { left: 48, right: 24, top: 24, bottom: 40 },
            xAxis: {
              type: 'category',
              data: measured.map((b) => b.label),
              axisLabel: { color: '#a1a1aa' },
              axisLine: { lineStyle: { color: '#3f3f46' } },
            },
            yAxis: {
              type: 'value',
              min: 0,
              // Not pinned to 100: with small numbers a real 8% would otherwise
              // be an invisible line along the axis.
              axisLabel: { color: '#a1a1aa', formatter: '{value}%' },
              splitLine: { lineStyle: { color: '#27272a' } },
            },
            series: [{
              type: 'line',
              smooth: true,
              symbolSize: 8,
              data: measured.map((b) => b.rate),
              lineStyle: { width: 3, color: '#10b981' },
              itemStyle: { color: '#10b981' },
              areaStyle: { color: 'rgba(16,185,129,0.12)' },
            }],
          }}
        />
      )}

      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-panel-muted">
            <th className="py-1">Window</th>
            <th className="py-1">Eligible</th>
            <th className="py-1">Returned</th>
            <th className="py-1">Rate</th>
          </tr>
        </thead>
        <tbody>
          {data.buckets.map((b) => (
            <tr key={b.label} className="border-t border-panel-line/50 text-panel-body">
              <td className="py-1.5">{b.label}</td>
              <td className="py-1.5 tabular-nums">{b.eligible}</td>
              <td className="py-1.5 tabular-nums">{b.returned}</td>
              <td className="py-1.5 tabular-nums">{b.rate === null ? '—' : `${b.rate}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
