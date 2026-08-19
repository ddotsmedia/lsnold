'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../../../lib/api';
import { fadeInUp } from '../../../lib/animations';
import { StatCard, StatusBadge, Button } from '../../../components/admin/shared';
import { HierarchyCharts } from '../../../components/admin/charts/HierarchyCharts';
import { EnrollmentTrendChart } from '../../../components/admin/charts/EnrollmentTrendChart';
import { ConversionFunnel } from '../../../components/admin/charts/ConversionFunnel';
import { VisitHeatmap } from '../../../components/admin/charts/VisitHeatmap';
import { DashboardWidgets } from '../../../components/admin/DashboardWidgets';
import { LiveActivity } from '../../../components/admin/LiveActivity';
import { AnomalyBanner } from '../../../components/admin/AnomalyBanner';
import { useRealtimeEvent } from '../../../lib/realtime';
import { Toast } from '../../../components/admin/shared';
import { AnalyticsReportButton } from '../../../components/admin/AnalyticsReportButton';

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
      <p className="text-sm text-panel-muted">
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
          <span className="w-40 shrink-0 truncate text-sm text-panel-body" title={page.path}>
            {page.path}
          </span>
          <div className="h-5 flex-1 overflow-hidden rounded bg-panel-raised/60">
            <div
              className="h-full rounded bg-gradient-to-r from-emerald-500/70 to-emerald-400 transition-all duration-500"
              style={{ width: `${Math.max((page.count / max) * 100, 2)}%` }}
            />
          </div>
          <span className="w-12 shrink-0 text-right text-sm font-medium tabular-nums text-panel-strong">
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
    <section className={`rounded-xl border border-panel-line/50 bg-panel-surface p-6 ${className}`}>
      <h3 className="text-sm font-medium text-panel-strong">{title}</h3>
      {hint && <p className="mb-4 text-xs text-panel-muted">{hint}</p>}
      {children}
    </section>
  );
}

/** The two views the dashboard offers. */
type Tab = 'overview' | 'breakdown';

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className={`relative min-h-11 px-4 text-sm font-medium transition-colors ${
        active ? 'text-emerald-400' : 'text-panel-muted hover:text-panel-body'
      }`}
    >
      {children}
      {/* layoutId slides the underline between tabs rather than cross-fading
          two separate bars, which is the whole reason it reads as one control. */}
      {active && (
        <motion.span
          layoutId="dashboard-tab-underline"
          className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-emerald-400"
        />
      )}
    </button>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Set briefly when a figure changes, so the affected card can flash.
  const [flash, setFlash] = useState(false);
  const [tab, setTab] = useState<Tab>('overview');
  const [refreshing, setRefreshing] = useState(false);

  /**
   * `fresh` bypasses the server's cache on the stats query. Without it the
   * button would re-request a cached answer and look like it had done nothing,
   * which is worse than having no button.
   */
  const load = useCallback(async (fresh = false) => {
    try {
      const res = await api<DashboardData>('/admin/dashboard/stats', {
        params: fresh ? { fresh: 'true' } : undefined,
      });
      setData(res);
      setError(null);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally { setLoading(false); }
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load(true);
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  useEffect(() => { void load(); }, [load]);

  /**
   * Refetch when something arrives, rather than adjusting a counter.
   *
   * The cards are derived from several columns each — a pending count, a total,
   * a thirty-day window — and nudging one of them by hand drifts away from the
   * database as soon as anything else moves. Refetching is one small query and
   * is always right.
   */
  const announce = useCallback((message: string) => {
    setToast(message);
    setFlash(true);
    void load();
    setTimeout(() => setFlash(false), 1500);
  }, [load]);

  useRealtimeEvent('booking:created', () => announce('New tour booking received'));
  useRealtimeEvent('booking:updated', () => announce('A booking was updated'));
  useRealtimeEvent('registration:created', () => announce('New registration received'));
  useRealtimeEvent('registration:updated', () => announce('A registration was updated'));

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-panel-line/50 bg-panel-surface p-8 text-center">
        <p className="text-sm text-panel-body">No data available</p>
        <p className="mt-1 text-xs text-panel-muted">{error ?? 'The dashboard could not be loaded.'}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 rounded-lg border border-panel-line-2 bg-panel-raised/50 px-4 py-2 text-sm text-panel-body transition-colors hover:bg-panel-raised"
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

      <AnomalyBanner />

      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-panel-line/50">
        <div role="tablist" aria-label="Dashboard views" className="flex gap-1">
          <TabButton active={tab === 'overview'} onClick={() => setTab('overview')}>
            Overview
          </TabButton>
          <TabButton active={tab === 'breakdown'} onClick={() => setTab('breakdown')}>
            Breakdown
          </TabButton>
        </div>

        <div className="flex items-center gap-2 pb-2">
          <Button variant="secondary" size="sm" onClick={() => void refresh()} disabled={refreshing}>
            <motion.span
              aria-hidden="true"
              className="mr-1.5 inline-block"
              animate={refreshing ? { rotate: 360 } : { rotate: 0 }}
              transition={
                refreshing
                  ? { duration: 0.8, repeat: Infinity, ease: 'linear' }
                  : { duration: 0.2 }
              }
            >
              ⟳
            </motion.span>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </Button>
          <AnalyticsReportButton />
        </div>
      </div>

      {/* mode="wait" so the outgoing panel finishes before the next arrives —
          overlapping them makes the height jump while both are mounted. */}
      <AnimatePresence mode="wait">
        {tab === 'breakdown' ? (
          <motion.div
            key="breakdown"
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="space-y-4"
          >
            <p className="text-xs text-panel-muted">
              Site traffic and admin activity, broken down. The same charts sit under
              Analytics → Breakdown with a selectable window.
            </p>
            <HierarchyCharts days={30} />
          </motion.div>
        ) : (
          <motion.div
            key="overview"
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="space-y-8"
          >
      <LiveActivity />

      <DashboardWidgets widgets={[
        { key: 'kpi', title: 'Headline numbers', render: () => (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Students" value={data.totalStudents} sublabel="approved registrations" accent="emerald" />
        <StatCard label="Total Registrations" value={data.totalRegistrations} sublabel={`${data.registrations.pending} pending`} accent="blue" className={flash ? 'ring-2 ring-emerald-500/60' : undefined} />
        <StatCard label="Total Page Views" value={data.pageViews} sublabel={`${data.analytics.viewsToday} today`} accent="purple" />
        <StatCard label="Tour Bookings" value={data.bookings.total} sublabel={`${data.bookings.upcoming} upcoming`} accent="amber" />
      </div>
        )},

        { key: 'counts', title: 'Content counts', render: () => (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="News & Events" value={data.events.total} accent="blue" />
        <StatCard label="Pages" value={data.pages.total} sublabel={`${data.pages.published} published`} accent="emerald" />
        <StatCard label="Gallery" value={data.gallery.total_images} sublabel={`${data.gallery.total_categories} categories`} accent="purple" />
        <StatCard label="Pending Bookings" value={data.bookings.pending} accent="amber" className={flash ? 'ring-2 ring-emerald-500/60' : undefined} />
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
      <div className="bg-panel-surface rounded-xl border border-panel-line/50 p-6">
        <div className="mb-4 flex items-baseline justify-between">
          <h3 className="text-sm font-medium text-panel-body">Top Visited Pages</h3>
          <span className="text-xs text-panel-muted">{data.analytics.viewsWeek} views this week</span>
        </div>
        <TopPagesChart pages={data.visitedPages} />
      </div>
        )},

        { key: 'status', title: 'Registration and booking status', render: () => (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-panel-surface rounded-xl border border-panel-line/50 p-6">
          <h3 className="text-sm font-medium text-panel-body mb-4">Registration Status</h3>
          <div className="space-y-3">
            {[
              { label: 'Approved', value: data.registrations.approved, color: 'bg-emerald-500' },
              { label: 'Pending', value: data.registrations.pending, color: 'bg-amber-500' },
              { label: 'Rejected', value: data.registrations.rejected, color: 'bg-red-500' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${item.color}`} />
                <span className="text-sm text-panel-body flex-1">{item.label}</span>
                <span className="text-sm font-medium text-panel-strong tabular-nums">{item.value}</span>
                <div className="w-24 h-1.5 bg-panel-raised rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${item.color}`}
                    style={{ width: `${data.registrations.total > 0 ? (item.value / data.registrations.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-panel-surface rounded-xl border border-panel-line/50 p-6">
          <h3 className="text-sm font-medium text-panel-body mb-4">Booking Status</h3>
          <div className="space-y-3">
            {[
              { label: 'Confirmed', value: data.bookings.confirmed, color: 'bg-emerald-500' },
              { label: 'Pending', value: data.bookings.pending, color: 'bg-amber-500' },
              { label: 'Cancelled', value: data.bookings.cancelled, color: 'bg-red-500' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${item.color}`} />
                <span className="text-sm text-panel-body flex-1">{item.label}</span>
                <span className="text-sm font-medium text-panel-strong tabular-nums">{item.value}</span>
                <div className="w-24 h-1.5 bg-panel-raised rounded-full overflow-hidden">
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
      <div className="bg-panel-surface rounded-xl border border-panel-line/50 p-6">
        <h3 className="text-sm font-medium text-panel-body mb-4">Recent Activity</h3>
        {data.recentActivity.length === 0 ? (
          <p className="text-sm text-panel-muted">No recent activity</p>
        ) : (
          <div className="space-y-3">
            {data.recentActivity.map((act) => (
              <div key={act.id} className="flex items-center gap-3 text-sm">
                <StatusBadge status={act.action} />
                <span className="text-panel-body">{act.admin_name || 'System'}</span>
                <span className="text-panel-faint">·</span>
                <span className="text-panel-body">{act.entity_type}</span>
                <span className="text-panel-faint text-xs ml-auto">
                  {new Date(act.created_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
        )},
      ]} />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>{toast && <Toast message={toast} type="success" />}</AnimatePresence>
    </div>
  );
}
