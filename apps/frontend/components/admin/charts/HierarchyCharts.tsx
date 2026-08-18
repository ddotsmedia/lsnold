'use client';

import { useEffect, useState } from 'react';
import { EChart } from './EChart';
import { api } from '../../../lib/api';
import { RoomOccupancyTreemap } from './RoomOccupancyTreemap';

/**
 * Two nested breakdowns of what the panel actually records.
 *
 * A treemap of site traffic and a sunburst of admin activity. Both are drawn
 * from real rows; neither is about enrolment, because there is none to draw —
 * see the note on the analytics tab.
 *
 * Both share one request, since they are read together and the figures should
 * come from the same moment.
 */

interface Node {
  name: string;
  value: number;
  children?: Array<{ name: string; value: number }>;
}

interface Hierarchy {
  days: number;
  traffic: Node[];
  activity: Node[];
}

/** Enough hues to separate top-level branches without a rainbow. */
const PALETTE = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#14b8a6', '#ec4899', '#84cc16'];

function Empty({ what }: { what: string }) {
  return (
    <p className="rounded-lg border border-panel-line bg-panel-sunken p-6 text-center text-sm text-panel-muted">
      Nothing to show yet — {what}.
    </p>
  );
}

export function HierarchyCharts({ days = 30 }: { days?: number }) {
  const [data, setData] = useState<Hierarchy | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<Hierarchy>('/admin/analytics/hierarchy', { params: { days } })
      .then((res) => { if (!cancelled) setData(res); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed'); });
    return () => { cancelled = true; };
  }, [days]);

  if (error) return <p className="p-6 text-sm text-red-400">{error}</p>;
  if (!data) return <div className="h-150 animate-pulse rounded-xl bg-panel-raised/40" />;

  const totalViews = data.traffic.reduce((sum, n) => sum + n.value, 0);
  const totalActions = data.activity.reduce((sum, n) => sum + n.value, 0);

  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-sm font-medium text-panel-strong">How full each room is</h3>
        <RoomOccupancyTreemap />
      </section>

      <section>
        <h3 className="text-sm font-medium text-panel-strong">Where visitors go</h3>
        <p className="mb-3 text-xs text-panel-muted">
          Every page view of the last {data.days} days, sized by share. Pages under the
          same section are grouped; click a block to zoom into it.
        </p>

        {totalViews === 0 ? (
          <Empty what="no page views have been recorded in this period" />
        ) : (
          <EChart
            ariaLabel="Treemap of page views, grouped by site section"
            height={380}
            option={{
              tooltip: {
                formatter: (params: unknown) => {
                  const p = params as { name: string; value: number };
                  const share = Math.round((p.value / totalViews) * 1000) / 10;
                  return `${p.name}<br/>${p.value} views · ${share}%`;
                },
              },
              series: [{
                type: 'treemap',
                data: data.traffic,
                roam: false,
                // The default breadcrumb is the only way back out of a zoom.
                breadcrumb: { show: true, itemStyle: { color: '#27272a', textStyle: { color: '#a1a1aa' } } },
                label: { show: true, formatter: '{b}', color: '#0a0a0f', fontWeight: 600 },
                upperLabel: { show: true, height: 24, color: '#e4e4e7' },
                levels: [
                  { itemStyle: { borderColor: '#0a0a0f', borderWidth: 3, gapWidth: 3 } },
                  { itemStyle: { borderColor: '#0a0a0f', borderWidth: 1, gapWidth: 1 } },
                ],
                itemStyle: { borderRadius: 4 },
                color: PALETTE,
              }],
            }}
          />
        )}
      </section>

      <section>
        <h3 className="text-sm font-medium text-panel-strong">What admins have been doing</h3>
        <p className="mb-3 text-xs text-panel-muted">
          Actions in the last {data.days} days: the inner ring is the kind of action,
          the outer ring what it was done to. Click a segment to zoom.
        </p>

        {totalActions === 0 ? (
          <Empty what="no admin actions have been recorded in this period" />
        ) : (
          <EChart
            ariaLabel="Sunburst of admin actions, from action type out to the kind of record affected"
            height={420}
            option={{
              tooltip: {
                formatter: (params: unknown) => {
                  const p = params as { name: string; value: number };
                  return `${p.name}<br/>${p.value} action${p.value === 1 ? '' : 's'}`;
                },
              },
              series: [{
                type: 'sunburst',
                data: data.activity,
                radius: [40, '92%'],
                color: PALETTE,
                emphasis: { focus: 'ancestor' },
                levels: [
                  {},
                  {
                    r0: 40, r: 130,
                    label: { rotate: 'tangential', color: '#0a0a0f', fontWeight: 600, minAngle: 12 },
                    itemStyle: { borderWidth: 2, borderColor: '#0a0a0f' },
                  },
                  {
                    r0: 130, r: 190,
                    // Below this angle a label overlaps its neighbour and both
                    // become unreadable; the tooltip still names the segment.
                    label: { align: 'right', color: '#e4e4e7', minAngle: 8 },
                    itemStyle: { borderWidth: 1, borderColor: '#0a0a0f' },
                  },
                ],
              }],
            }}
          />
        )}
      </section>
    </div>
  );
}
