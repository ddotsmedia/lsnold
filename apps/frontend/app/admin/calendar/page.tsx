'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '../../../lib/api';
import { Button, FormField, Modal, Toast } from '../../../components/admin/shared';

/**
 * When scheduled sections go live.
 *
 * A hand-built month grid rather than react-calendar: the library ships its
 * own stylesheet built for a date *picker*, and every cell here needs to hold
 * a list rather than a number, so almost all of it would be overridden.
 */

interface Scheduled {
  section_id: string;
  section_key: string;
  title: string | null;
  scheduled_publish_at: string;
  published_at: string | null;
  page_id: string;
  page_slug: string;
  page_title: string;
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Local YYYY-MM-DD. toISOString would shift the day by the browser's offset. */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** `datetime-local` wants "YYYY-MM-DDTHH:mm" in local time, with no zone. */
function toLocalInput(d: Date): string {
  return `${dayKey(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * The grid always starts on a Monday and runs whole weeks, so the month sits
 * in the same shape regardless of which day it opens on.
 */
function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  // getDay() is Sunday-first; shift so Monday is 0.
  const lead = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - lead);

  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    cells.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
    // Stop after the week that contains the last day of the month.
    if (i >= 27 && cells[i]!.getMonth() !== month && (i + 1) % 7 === 0) break;
  }
  return cells;
}

export default function CalendarPage() {
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [items, setItems] = useState<Scheduled[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState<Scheduled | null>(null);
  const [newWhen, setNewWhen] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const cells = useMemo(() => monthGrid(cursor.getFullYear(), cursor.getMonth()), [cursor]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // The visible grid, not the calendar month: leading and trailing days
      // belong to neighbouring months and still need their entries.
      const first = cells[0];
      const last = cells[cells.length - 1];
      if (!first || !last) return;
      setItems(
        await api<Scheduled[]>('/admin/pages/scheduled', {
          params: { from: dayKey(first), to: dayKey(last) },
        })
      );
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Could not load the calendar',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [cells]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const byDay = useMemo(() => {
    const map = new Map<string, Scheduled[]>();
    for (const item of items) {
      const key = dayKey(new Date(item.scheduled_publish_at));
      const list = map.get(key);
      if (list) list.push(item);
      else map.set(key, [item]);
    }
    return map;
  }, [items]);

  const reschedule = async (): Promise<void> => {
    if (!rescheduling || !newWhen) return;
    setSaving(true);
    try {
      await api(
        `/admin/pages/${rescheduling.page_id}/content/${rescheduling.section_id}/schedule`,
        {
          method: 'POST',
          // The server wants an absolute moment; the input gives local wall time.
          body: JSON.stringify({ scheduled_publish_at: new Date(newWhen).toISOString() }),
        }
      );
      setRescheduling(null);
      await load();
      setToast({ message: 'Rescheduled', type: 'success' });
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : 'Could not reschedule',
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const monthLabel = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const dayItems = selectedDay ? (byDay.get(selectedDay) ?? []) : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-panel-strong">Content calendar</h1>
          <p className="mt-1 text-sm text-panel-muted">
            Sections waiting to go live. The publisher runs every five minutes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            aria-label="Previous month"
            onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
          >
            ‹
          </Button>
          <span className="min-w-40 text-center text-sm font-medium text-panel-strong">
            {monthLabel}
          </span>
          <Button
            variant="secondary"
            size="sm"
            aria-label="Next month"
            onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
          >
            ›
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
          >
            Today
          </Button>
        </div>
      </div>

      {loading && <p className="text-sm text-panel-muted">Loading…</p>}

      {!loading && items.length === 0 && (
        <p className="rounded-xl border border-panel-line/50 bg-panel-sunken p-4 text-sm text-panel-muted">
          Nothing scheduled this month. Schedule a section from any page&rsquo;s Text tab.
        </p>
      )}

      {/* Scrolls rather than squeezing: seven columns holding lists do not fit
          a phone, and a squeezed cell shows nothing useful. */}
      <div className="overflow-x-auto">
        <div className="min-w-160">
          <div className="grid grid-cols-7 gap-px">
            {DAY_NAMES.map((d) => (
              <div key={d} className="pb-1 text-center text-[11px] uppercase tracking-wider text-panel-muted">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-panel-line bg-panel-line">
            {cells.map((cell) => {
              const key = dayKey(cell);
              const entries = byDay.get(key) ?? [];
              const otherMonth = cell.getMonth() !== cursor.getMonth();
              const isToday = key === dayKey(today);

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => entries.length > 0 && setSelectedDay(key)}
                  aria-label={`${cell.toDateString()}, ${entries.length} scheduled`}
                  className={`min-h-24 p-1.5 text-left align-top transition-colors ${
                    otherMonth ? 'bg-panel-base text-panel-faint' : 'bg-panel-surface'
                  } ${entries.length > 0 ? 'cursor-pointer hover:bg-panel-raised' : 'cursor-default'}`}
                >
                  <span
                    className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                      isToday ? 'bg-emerald-500/20 text-emerald-400' : 'text-panel-muted'
                    }`}
                  >
                    {cell.getDate()}
                  </span>

                  <span className="mt-1 block space-y-0.5">
                    {entries.slice(0, 2).map((e) => (
                      <span
                        key={e.section_id}
                        className="block truncate rounded bg-amber-500/10 px-1 py-0.5 text-[10px] text-amber-400"
                      >
                        {e.title || e.section_key}
                      </span>
                    ))}
                    {entries.length > 2 && (
                      <span className="block text-[10px] text-panel-muted">
                        +{entries.length - 2} more
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <Modal
        open={selectedDay !== null}
        onClose={() => setSelectedDay(null)}
        title={selectedDay ? new Date(`${selectedDay}T12:00:00`).toDateString() : ''}
      >
        <ul className="space-y-3">
          {dayItems.map((item) => (
            <li key={item.section_id} className="rounded-lg border border-panel-line bg-panel-sunken p-3">
              <p className="text-sm font-medium text-panel-strong">
                {item.title || item.section_key}
              </p>
              <p className="mt-0.5 font-mono text-[11px] text-panel-muted">
                {item.page_title} · {item.section_key}
              </p>
              <p className="mt-1 text-xs text-amber-400">
                {new Date(item.scheduled_publish_at).toLocaleString(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
                {/* Past its moment but not yet stamped: live to visitors,
                    waiting on the next publisher run. */}
                {!item.published_at && new Date(item.scheduled_publish_at) <= new Date() && (
                  <span className="ml-2 text-emerald-400">due — publishing shortly</span>
                )}
              </p>
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setRescheduling(item);
                    setNewWhen(toLocalInput(new Date(item.scheduled_publish_at)));
                    setSelectedDay(null);
                  }}
                >
                  Reschedule
                </Button>
                <Link href={`/admin/pages/${item.page_id}/content`}>
                  <Button size="sm" variant="ghost">Open page</Button>
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </Modal>

      <Modal
        open={rescheduling !== null}
        onClose={() => setRescheduling(null)}
        title="Reschedule section"
      >
        <div className="space-y-4">
          <p className="text-sm text-panel-muted">
            {rescheduling?.title || rescheduling?.section_key} on {rescheduling?.page_title}
          </p>
          <FormField label="Publish at">
            <input
              type="datetime-local"
              value={newWhen}
              onChange={(e) => setNewWhen(e.target.value)}
              className="w-full rounded-lg border border-zinc-800 bg-[#0c0c14] px-4 py-2.5 text-sm text-zinc-200 focus:border-emerald-500/50 focus:outline-none"
            />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRescheduling(null)}>Cancel</Button>
            <Button onClick={() => void reschedule()} disabled={saving || !newWhen}>
              {saving ? 'Saving…' : 'Reschedule'}
            </Button>
          </div>
        </div>
      </Modal>

      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}
