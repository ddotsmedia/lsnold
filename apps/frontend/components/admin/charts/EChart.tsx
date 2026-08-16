'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { LineChart, HeatmapChart, BarChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapComponent,
  MarkLineComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsOption } from 'echarts';

/**
 * The one place ECharts is set up.
 *
 * Imported from echarts/core with only the pieces these charts use, rather than
 * the whole library: the full bundle is over a megabyte and the dashboard needs
 * three chart types.
 *
 * Registration happens once at module scope. Doing it inside the component
 * would re-run it on every mount.
 */
echarts.use([
  LineChart, HeatmapChart, BarChart,
  GridComponent, TooltipComponent, LegendComponent, VisualMapComponent, MarkLineComponent,
  CanvasRenderer,
]);

/** Shared dark styling, so the charts match the panel rather than each other. */
export const AXIS_STYLE = {
  axisLine: { lineStyle: { color: '#3f3f46' } },
  axisLabel: { color: '#a1a1aa', fontSize: 11 },
  splitLine: { lineStyle: { color: '#27272a' } },
} as const;

export const TOOLTIP_STYLE = {
  backgroundColor: '#18181b',
  borderColor: '#3f3f46',
  textStyle: { color: '#e4e4e7', fontSize: 12 },
} as const;

export function EChart({
  option,
  height = 280,
  ariaLabel,
}: {
  option: EChartsOption;
  height?: number;
  ariaLabel: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!container.current) return;
    chart.current = echarts.init(container.current, undefined, { renderer: 'canvas' });

    // ResizeObserver rather than a window listener: the sidebar collapsing
    // changes the chart's width without the window changing at all.
    const observer = new ResizeObserver(() => chart.current?.resize());
    observer.observe(container.current);

    return () => {
      observer.disconnect();
      chart.current?.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    chart.current?.setOption(option, true);
  }, [option]);

  return (
    <div
      ref={container}
      role="img"
      aria-label={ariaLabel}
      style={{ height, width: '100%' }}
    />
  );
}
