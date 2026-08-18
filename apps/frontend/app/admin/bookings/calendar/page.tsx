'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BookingCalendar } from '../../../../components/admin/BookingCalendar';
import { Toast } from '../../../../components/admin/shared';

/**
 * The same bookings as the table, laid out by date.
 *
 * A separate route rather than a tab inside the table page: the calendar loads
 * a wide range of rows and pulls in its own stylesheet, and neither should be
 * paid for by someone who only wanted the list.
 */
export default function BookingCalendarPage() {
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }
  }, [toast]);

  return (
    <div className="space-y-4">
      <nav className="flex gap-1 border-b border-panel-line" aria-label="Booking views">
        <Link
          href="/admin/bookings"
          className="-mb-px border-b-2 border-transparent px-4 py-3 text-sm font-medium text-panel-muted transition-colors hover:border-panel-line-2 hover:text-panel-body"
        >
          Table
        </Link>
        <span
          aria-current="page"
          className="-mb-px border-b-2 border-emerald-500 px-4 py-3 text-sm font-medium text-emerald-400"
        >
          Calendar
        </span>
      </nav>

      <BookingCalendar onToast={(message, type) => setToast({ message, type })} />

      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}
