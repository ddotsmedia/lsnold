'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { StatCard, StatusBadge } from '../../../components/admin/shared';
import { EnrollmentTrendChart } from '../../../components/admin/charts/EnrollmentTrendChart';
import { ConversionFunnel } from '../../../components/admin/charts/ConversionFunnel';
import { VisitHeatmap } from '../../../components/admin/charts/VisitHeatmap';
import { DashboardWidgets } from '../../../components/admin/DashboardWidgets';

interface DashboardData {
  totalStudents: number;
  totalRegistrations: number;
  pageViews: number;
  visitedPages: Array<{ path: string; count: number }>;
  registrations: { total: number; pending: number; approved: number; rejected: number; last_30_days: number };
  bookings: { total: number; pending: number; confirmed: number; cancelled: number; upcoming: number };
  events: { total: number };
  pages: { total: number; published: number; draft: number };
  gallery: { total_images: number; total_categories: number };
  analytics: { viewsToday: number; viewsWeek: number };
  recentActivity: Array<{
    id: string; action: string; entity_type: string; entity_id: string;
    admin_name: string; created_at: string; details: Record<string, unknown>;
  }>;
  /** Names of the statistics the server could not compute this time. */
  degraded?: string[];
}

/** Horizontal bars, so long page paths stay readable at any width. */
function TopPagesChart({ pages }: { pages: Array<{ path: string; count: number }> }) {
  if (pages.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No data available yet — page views appear here once visitors browse the site.
      </p>
    );
  }

  // Scaled against the busiest page, so the chart uses its full width whatever
  // the absolute numbers are.
  const max = Math.max(...pages.map((p) => p.count), 1);

  return (
    <div className="space-y-2.5">
      {pages.map((page) => (
        <div key={page.path} className="flex items-center gap-3">
          <span className="w-40 shrink-0 truncate text-sm text-zinc-400" title={page.path}>
            {page.path}
          </span>
          <div className="h-5 flex-1 overflow-hidden rounded bg-zinc-800/60">
            <div
              className="h-full rounded bg-gradient-to-r from-emerald-500/70 to-emerald-400 transition-all duration-500"
              style={{ width: `${Math.max((page.count / max) * 100, 2)}%` }}
            />
          </div>
          <span className="w-12 shrink-0 text-right text-sm font-medium tabular-nums text-zinc-200">
            {page.count}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Frame around a chart, so the three read as one set.
 *
 * Module scope, not nested in the page: as a nested function it would be a new
 * component type on every render and remount every chart — and an ECharts
 * instance re-initialising mid-animation is both visible and wasteful.
 */
function ChartCard({
  title,
  hint,
  className = '',
  children,
}: {
  title: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`rounded-xl border border-zinc-800/50 bg-[#111119] p-6 ${className}`}>
      <h3 className="text-sm font-medium text-zinc-200">{title}</h3>
      {hint && <p className="mb-4 text-xs text-zinc-500">{hint}</p>}
      {children}
    </section>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<DashboardData>('/admin/dashboard/stats')
      .then((res) => { setData(res); setError(null); })
      .catch((err: unknown) => {
        console.error(err);
        setError(err instanceof Error ? err.message : 'Failed to load dashboard');
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-zinc-800/50 bg-[#111119] p-8 text-center">
        <p className="text-sm text-zinc-300">No data available</p>
        <p className="mt-1 text-xs text-zinc-500">{error ?? 'The dashboard could not be loaded.'}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {data.degraded && data.degraded.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
          Some statistics are unavailable ({data.degraded.join(', ')}). Everything else below is current.
        </div>
      )}

      <DashboardWidgets widgets={[
        { key: 'kpi', title: 'Headline numbers', render: () => (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Students" value={data.totalStudents} sublabel="approved registrations" accent="emerald" />
        <StatCard label="Total Registrations" value={data.totalRegistrations} sublabel={`${data.registrations.pending} pending`} accent="blue" />
        <StatCard label="Total Page Views" value={data.pageViews} sublabel={`${data.analytics.viewsToday} today`} accent="purple" />
        <StatCard label="Tour Bookings" value={data.bookings.total} sublabel={`${data.bookings.upcoming} upcoming`} accent="amber" />
      </div>
        )},

        { key: 'counts', title: 'Content counts', render: () => (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="News & Events" value={data.events.total} accent="blue" />
        <StatCard label="Pages" value={data.pages.total} sublabel={`${data.pages.published} published`} accent="emerald" />
        <StatCard label="Gallery" value={data.gallery.total_images} sublabel={`${data.gallery.total_categories} categories`} accent="purple" />
        <StatCard label="Pending Bookings" value={data.bookings.pending} accent="amber" />
      </div>
        )},

        // Each chart loads its own data and handles its own empty state, so a
        // quiet metric cannot take the dashboard down with it.
        { key: 'charts', title: 'Registrations and funnel', render: () => (
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard
          title="Registrations over time"
          hint="Daily count, with a projection ahead"
          className="xl:col-span-2"
        >
          <EnrollmentTrendChart />
        </ChartCard>

        <ChartCard title="Visitors to registrations" hint="Where people stop">
          <ConversionFunnel />
        </ChartCard>
      </div>
        )},

        { key: 'heatmap', title: 'When families visit', render: () => (
      <ChartCard title="When families visit" hint="Site visits by weekday and hour">
        <VisitHeatmap />
      </ChartCard>
        )},

        { key: 'top-pages', title: 'Top visited pages', render: () => (
      <div className="bg-[#111119] rounded-xl border border-zinc-800/50 p-6">
        <div className="mb-4 flex items-baseline justify-between">
          <h3 className="text-sm font-medium text-zinc-300">Top Visited Pages</h3>
          <span className="text-xs text-zinc-500">{data.analytics.viewsWeek} views this week</span>
        </div>
        <TopPagesChart pages={data.visitedPages} />
      </div>
        )},

        { key: 'status', title: 'Registration and booking status', render: () => (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#111119] rounded-xl border border-zinc-800/50 p-6">
          <h3 className="text-sm font-medium text-zinc-300 mb-4">Registration Status</h3>
          <div className="space-y-3">
            {[
              { label: 'Approved', value: data.registrations.approved, color: 'bg-emerald-500' },
              { label: 'Pending', value: data.registrations.pending, color: 'bg-amber-500' },
              { label: 'Rejected', value: data.registrations.rejected, color: 'bg-red-500' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${item.color}`} />
                <span className="text-sm text-zinc-400 flex-1">{item.label}</span>
                <span className="text-sm font-medium text-zinc-200 tabular-nums">{item.value}</span>
                <div className="w-24 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${item.color}`}
                    style={{ width: `${data.registrations.total > 0 ? (item.value / data.registrations.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#111119] rounded-xl border border-zinc-800/50 p-6">
          <h3 className="text-sm font-medium text-zinc-300 mb-4">Booking Status</h3>
          <div className="space-y-3">
            {[
              { label: 'Confirmed', value: data.bookings.confirmed, color: 'bg-emerald-500' },
              { label: 'Pending', value: data.bookings.pending, color: 'bg-amber-500' },
              { label: 'Cancelled', value: data.bookings.cancelled, color: 'bg-red-500' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${item.color}`} />
                <span className="text-sm text-zinc-400 flex-1">{item.label}</span>
                <span className="text-sm font-medium text-zinc-200 tabular-nums">{item.value}</span>
                <div className="w-24 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${item.color}`}
                    style={{ width: `${data.bookings.total > 0 ? (item.value / data.bookings.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
        )},

        { key: 'activity', title: 'Recent activity', render: () => (
      <div className="bg-[#111119] rounded-xl border border-zinc-800/50 p-6">
        <h3 className="text-sm font-medium text-zinc-300 mb-4">Recent Activity</h3>
        {data.recentActivity.length === 0 ? (
          <p className="text-sm text-zinc-500">No recent activity</p>
        ) : (
          <div className="space-y-3">
            {data.recentActivity.map((act) => (
              <div key={act.id} className="flex items-center gap-3 text-sm">
                <StatusBadge status={act.action} />
                <span className="text-zinc-400">{act.admin_name || 'System'}</span>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-300">{act.entity_type}</span>
                <span className="text-zinc-600 text-xs ml-auto">
                  {new Date(act.created_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
        )},
      ]} />
    </div>
  );
}
