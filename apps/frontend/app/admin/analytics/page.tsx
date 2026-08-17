'use client';

import { useEffect, useState } from 'react';
import { ConversionFunnel } from '../../../components/admin/charts/ConversionFunnel';
import { api } from '../../../lib/api';
import { StatCard, FilterSelect } from '../../../components/admin/shared';

interface OverviewData {
  period: { days: number; since: string };
  totalViews: number;
  uniqueVisitors: number;
  topPages: Array<{ page_path: string; views: number; unique_visitors: number }>;
  deviceBreakdown: Array<{ device_type: string; count: number }>;
  referrers: Array<{ referrer: string; count: number }>;
}

interface TimeSeriesData {
  data: Array<{ period: string; views: number; unique_visitors: number }>;
}

interface BrowserData { browser: string; count: number; }
interface CountryData { country: string; count: number; }

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [timeSeries, setTimeSeries] = useState<TimeSeriesData | null>(null);
  const [browsers, setBrowsers] = useState<BrowserData[]>([]);
  const [countries, setCountries] = useState<CountryData[]>([]);
  const [days, setDays] = useState('30');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api<OverviewData>('/admin/analytics/overview', { params: { days: Number(days) } }),
      api<TimeSeriesData>('/admin/analytics/time-series', { params: { days: Number(days) } }),
      api<BrowserData[]>('/admin/analytics/browsers', { params: { days: Number(days) } }),
      api<CountryData[]>('/admin/analytics/countries', { params: { days: Number(days) } }),
    ])
      .then(([ov, ts, br, co]) => { setOverview(ov); setTimeSeries(ts); setBrowsers(br); setCountries(co); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [days]);

  if (loading) {
    return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" /></div>;
  }

  if (!overview) return <p className="text-zinc-500">Failed to load analytics</p>;

  const maxViews = Math.max(...(timeSeries?.data.map((d) => d.views) || [1]));

  return (
    <div className="space-y-8">
      {/* Period selector */}
      <div className="flex justify-end">
        <FilterSelect
          value={days}
          onChange={setDays}
          options={[
            { value: '7', label: 'Last 7 days' },
            { value: '30', label: 'Last 30 days' },
            { value: '90', label: 'Last 90 days' },
            { value: '365', label: 'Last year' },
          ]}
          allLabel="Period"
        />
      </div>

      <section className="rounded-xl border border-zinc-800/50 bg-[#111119] p-6">
        <h3 className="text-sm font-medium text-zinc-200">Visitors to registrations</h3>
        <p className="mb-4 text-xs text-zinc-500">
          Where people stop between arriving and registering.
        </p>
        <ConversionFunnel days={Number(days) || 30} />
      </section>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Page Views" value={overview.totalViews.toLocaleString()} accent="blue" />
        <StatCard label="Unique Visitors" value={overview.uniqueVisitors.toLocaleString()} accent="purple" />
        <StatCard label="Top Pages" value={overview.topPages.length} accent="emerald" />
        <StatCard label="Referral Sources" value={overview.referrers.length} accent="amber" />
      </div>

      {/* Views chart (simple bar chart with CSS) */}
      {timeSeries && timeSeries.data.length > 0 && (
        <div className="bg-[#111119] rounded-xl border border-zinc-800/50 p-6">
          <h3 className="text-sm font-medium text-zinc-300 mb-4">Page Views Over Time</h3>
          <div className="flex items-end gap-[2px] h-40">
            {timeSeries.data.map((d, i) => (
              <div
                key={i}
                className="flex-1 bg-emerald-500/30 hover:bg-emerald-500/50 rounded-t transition-colors relative group min-w-[3px]"
                style={{ height: `${Math.max(2, (d.views / maxViews) * 100)}%` }}
              >
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-300 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10">
                  {new Date(d.period).toLocaleDateString()}: {d.views} views
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2 text-[10px] text-zinc-600">
            <span>{timeSeries.data[0] ? new Date(timeSeries.data[0].period).toLocaleDateString() : ''}</span>
            <span>{timeSeries.data.length > 0 ? new Date(timeSeries.data[timeSeries.data.length - 1]!.period).toLocaleDateString() : ''}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Pages */}
        <div className="bg-[#111119] rounded-xl border border-zinc-800/50 p-6">
          <h3 className="text-sm font-medium text-zinc-300 mb-4">Top Pages</h3>
          <div className="space-y-2">
            {overview.topPages.slice(0, 10).map((p, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span className="text-zinc-600 w-5 text-right tabular-nums">{i + 1}</span>
                <span className="text-zinc-300 flex-1 truncate">{p.page_path}</span>
                <span className="text-zinc-500 tabular-nums">{p.views}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Device Breakdown */}
        <div className="bg-[#111119] rounded-xl border border-zinc-800/50 p-6">
          <h3 className="text-sm font-medium text-zinc-300 mb-4">Devices</h3>
          <div className="space-y-3">
            {overview.deviceBreakdown.map((d) => {
              const pct = overview.totalViews > 0 ? (d.count / overview.totalViews) * 100 : 0;
              const colors: Record<string, string> = { desktop: 'bg-blue-500', mobile: 'bg-emerald-500', tablet: 'bg-amber-500' };
              return (
                <div key={d.device_type} className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${colors[d.device_type] || 'bg-zinc-500'}`} />
                  <span className="text-sm text-zinc-400 flex-1 capitalize">{d.device_type}</span>
                  <span className="text-sm text-zinc-300 tabular-nums">{pct.toFixed(1)}%</span>
                  <div className="w-24 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${colors[d.device_type] || 'bg-zinc-500'}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Referrers */}
        <div className="bg-[#111119] rounded-xl border border-zinc-800/50 p-6">
          <h3 className="text-sm font-medium text-zinc-300 mb-4">Top Referrers</h3>
          <div className="space-y-2">
            {overview.referrers.slice(0, 10).map((r, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span className="text-zinc-600 w-5 text-right tabular-nums">{i + 1}</span>
                <span className="text-zinc-300 flex-1 truncate">{r.referrer}</span>
                <span className="text-zinc-500 tabular-nums">{r.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Browsers */}
        <div className="bg-[#111119] rounded-xl border border-zinc-800/50 p-6">
          <h3 className="text-sm font-medium text-zinc-300 mb-4">Browsers</h3>
          <div className="space-y-2">
            {browsers.slice(0, 10).map((b, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span className="text-zinc-600 w-5 text-right tabular-nums">{i + 1}</span>
                <span className="text-zinc-300 flex-1">{b.browser}</span>
                <span className="text-zinc-500 tabular-nums">{b.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Countries */}
        {countries.length > 0 && (
          <div className="bg-[#111119] rounded-xl border border-zinc-800/50 p-6 lg:col-span-2">
            <h3 className="text-sm font-medium text-zinc-300 mb-4">Countries</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {countries.slice(0, 20).map((c, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-zinc-400 flex-1">{c.country}</span>
                  <span className="text-zinc-500 tabular-nums">{c.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
