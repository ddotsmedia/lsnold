'use client';

/**
 * One-click filters that need no setting up.
 *
 * Built in rather than saved: every screen wants "today" and "this week", and
 * making each admin create those by hand before they can use them would be
 * busywork. Saved presets in FilterBar remain for the combinations particular
 * to how someone works.
 *
 * A pill is shown as active when the filters it would apply are already the
 * ones in force, so the row reflects the table rather than just setting it.
 */

/** Local-time YYYY-MM-DD. toISOString would shift the day by the offset. */
function isoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function startOfWeek(from: Date): Date {
  const date = new Date(from);
  // Weeks here run Monday to Sunday, which is how the nursery's diary reads.
  const shift = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - shift);
  return date;
}

export interface QuickFilter {
  key: string;
  label: string;
  filters: Record<string, string>;
}

/** The date ranges, which mean the same thing on every screen. */
export function dateQuickFilters(): QuickFilter[] {
  const today = new Date();
  const monday = startOfWeek(today);
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  return [
    { key: 'today', label: 'Today', filters: { dateFrom: isoDate(today), dateTo: isoDate(today) } },
    { key: 'week', label: 'This week', filters: { dateFrom: isoDate(monday), dateTo: isoDate(sunday) } },
    { key: 'month', label: 'This month', filters: { dateFrom: isoDate(monthStart), dateTo: isoDate(monthEnd) } },
  ];
}

export function QuickFilters({
  filters,
  onChange,
  statuses = [],
}: {
  filters: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  /** Status pills, which differ per screen — a booking is confirmed, a
   *  registration is approved. */
  statuses?: Array<{ value: string; label: string }>;
}) {
  const pills: QuickFilter[] = [
    ...dateQuickFilters(),
    ...statuses.map((s) => ({ key: `status-${s.value}`, label: s.label, filters: { status: s.value } })),
  ];

  const isActive = (pill: QuickFilter) =>
    Object.entries(pill.filters).every(([key, value]) => filters[key] === value);

  const toggle = (pill: QuickFilter) => {
    const next = { ...filters };
    if (isActive(pill)) {
      // Pressing an active pill clears what it set, rather than doing nothing.
      for (const key of Object.keys(pill.filters)) delete next[key];
    } else {
      Object.assign(next, pill.filters);
    }
    onChange(next);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-medium uppercase tracking-wider text-panel-muted">Quick</span>
      {pills.map((pill) => {
        const active = isActive(pill);
        return (
          <button
            key={pill.key}
            type="button"
            onClick={() => toggle(pill)}
            aria-pressed={active}
            className={`min-h-12 rounded-full border px-4 text-xs transition-colors ${
              active
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                : 'border-panel-line text-panel-body hover:bg-panel-raised/40 hover:text-panel-strong'
            }`}
          >
            {pill.label}
          </button>
        );
      })}
    </div>
  );
}
