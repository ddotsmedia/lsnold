'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop';
import type { View } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { enGB } from 'date-fns/locale';
import { api } from '../../lib/api';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';

/**
 * Tour bookings as a calendar, with drag to reschedule.
 *
 * Dragging is a convenience over the table, not a replacement: react-big-calendar's
 * drag addon is mouse-driven, so on a phone the table with its status buttons
 * remains the way to work. Both views read the same rows.
 *
 * Every rule about when a tour may happen lives on the server. The calendar
 * refuses the obvious cases early only so the admin gets an immediate answer;
 * the endpoint checks again regardless.
 */

const locales = { 'en-GB': enGB };
const localizer = dateFnsLocalizer({
  format,
  parse,
  // Weeks run Monday to Sunday, matching the quick filters and the diary.
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales,
});

const DnDCalendar = withDragAndDrop<BookingEvent, object>(Calendar);

export interface Booking {
  id: string;
  visitor_name: string;
  visitor_email: string;
  preferred_date: string;
  preferred_time: string;
  status: string;
  number_of_children: number | null;
}

interface BookingEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  status: string;
  booking: Booking;
}

/** The slots a tour can occupy, matching TIME_SLOTS on the server. */
const SLOTS = ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'];

/**
 * Builds a local Date from the stored date and time.
 *
 * Assembled from parts rather than parsed from a string: `new Date('2026-09-15')`
 * is treated as UTC and lands on the previous evening in a positive offset,
 * which would show every booking on the wrong day here.
 */
function toDate(datePart: string, timePart: string): Date {
  const [y, m, d] = datePart.slice(0, 10).split('-').map(Number);
  const [hh, mm] = timePart.slice(0, 5).split(':').map(Number);
  return new Date(y ?? 2000, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0);
}

function isoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Nearest allowed slot to where the event was dropped. */
function nearestSlot(date: Date): string {
  const minutes = date.getHours() * 60 + date.getMinutes();
  let best = SLOTS[0]!;
  let bestGap = Infinity;
  for (const slot of SLOTS) {
    const [h, m] = slot.split(':').map(Number);
    const gap = Math.abs((h ?? 0) * 60 + (m ?? 0) - minutes);
    if (gap < bestGap) { bestGap = gap; best = slot; }
  }
  return best;
}

const STATUS_COLOURS: Record<string, string> = {
  pending: '#f59e0b',
  confirmed: '#10b981',
  cancelled: '#ef4444',
};

export function BookingCalendar({
  onToast,
}: {
  onToast: (message: string, type: 'success' | 'error') => void;
}) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>(Views.MONTH);
  const [date, setDate] = useState(new Date());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // A high limit rather than pagination: a calendar showing only the first
      // twenty of a month would quietly lie about what is booked.
      const res = await api<{ data: Booking[] }>('/admin/tour-bookings', {
        params: { limit: 500 },
      });
      setBookings(res.data);
    } catch {
      onToast('Could not load bookings', 'error');
    } finally { setLoading(false); }
    // onToast is a fresh closure each render; depending on it would reload
    // the calendar continuously.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void load(); }, [load]);

  const events = useMemo<BookingEvent[]>(() => bookings.map((booking) => {
    const start = toDate(booking.preferred_date, booking.preferred_time);
    // Tours are treated as an hour, which is what the slot spacing implies.
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    return {
      id: booking.id,
      title: `${booking.visitor_name}${booking.number_of_children ? ` (${booking.number_of_children})` : ''}`,
      start,
      end,
      status: booking.status,
      booking,
    };
  }), [bookings]);

  const move = async ({ event, start }: { event: BookingEvent; start: Date | string }) => {
    const dropped = start instanceof Date ? start : new Date(start);
    const nextDate = isoDate(dropped);
    // In month view the drop carries no meaningful time, so the slot is kept.
    const nextTime = view === Views.MONTH
      ? event.booking.preferred_time.slice(0, 5)
      : nearestSlot(dropped);

    if (nextDate === event.booking.preferred_date.slice(0, 10)
      && nextTime === event.booking.preferred_time.slice(0, 5)) {
      return;
    }

    // Answered immediately rather than waiting for the round trip; the server
    // checks this too.
    if (nextDate < isoDate(new Date())) {
      onToast('Cannot reschedule to a past date', 'error');
      return;
    }

    // Moved on screen first, then put back if the server refuses — a calendar
    // that snaps back after a pause feels broken.
    const previous = bookings;
    setBookings((rows) => rows.map((b) =>
      b.id === event.id ? { ...b, preferred_date: nextDate, preferred_time: nextTime } : b));

    try {
      await api(`/admin/tour-bookings/${event.id}/reschedule`, {
        method: 'PUT',
        body: JSON.stringify({ preferred_date: nextDate, preferred_time: nextTime }),
      });
      onToast(`Moved to ${format(dropped, 'd MMM')} at ${nextTime}`, 'success');
    } catch (err) {
      setBookings(previous);
      onToast(err instanceof Error ? err.message : 'Could not reschedule', 'error');
    }
  };

  if (loading) return <div className="h-150 animate-pulse rounded-xl bg-panel-raised/40" />;

  return (
    <div className="rounded-xl border border-panel-line/50 bg-panel-surface p-4">
      <div className="mb-3 flex flex-wrap gap-3 text-xs text-panel-muted">
        {Object.entries(STATUS_COLOURS).map(([status, colour]) => (
          <span key={status} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: colour }} aria-hidden="true" />
            <span className="capitalize">{status}</span>
          </span>
        ))}
        <span className="ml-auto">Drag an event to move it. Tours run {SLOTS.join(', ')}.</span>
      </div>

      {/* rbc-dark is defined in globals.css; the library ships light styling. */}
      <div className="rbc-dark">
        <DnDCalendar
          localizer={localizer}
          events={events}
          view={view}
          onView={setView}
          date={date}
          onNavigate={setDate}
          views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]}
          startAccessor="start"
          endAccessor="end"
          style={{ height: 600 }}
          popup
          onEventDrop={move}
          // Resizing would imply a tour length the slots do not model.
          resizable={false}
          tooltipAccessor={(event) =>
            `${event.booking.visitor_name} — ${event.booking.preferred_time.slice(0, 5)} — ${event.status}`}
          eventPropGetter={(event) => ({
            style: {
              backgroundColor: STATUS_COLOURS[event.status] ?? '#71717a',
              border: 'none',
              color: '#0a0a0f',
              fontWeight: 600,
              fontSize: 12,
              // A cancelled tour still occupies its place in the diary, but
              // should not read as active.
              opacity: event.status === 'cancelled' ? 0.55 : 1,
            },
          })}
        />
      </div>
    </div>
  );
}
