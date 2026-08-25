'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Button } from '@/components/Button';
import { usePhone, telHref } from '@/lib/footer';
import { cloudinaryResize, buildSrcSet, CARD_WIDTHS, WIDE_WIDTHS, CARD_SIZES } from '@/lib/cloudinary';

interface EventDetail {
  id: string;
  title: string;
  description: string | null;
  event_date: string | null;
  event_time: string | null;
  end_time: string | null;
  location: string | null;
  image_url: string | null;
  event_type: string;
  age_groups: string | null;
  capacity: number | null;
  current_registrations: number;
}

const API = process.env.NEXT_PUBLIC_API_URL;

const TYPE_STYLES: Record<string, string> = {
  Celebration: 'bg-red-100 text-red-700',
  Workshop: 'bg-blue-100 text-blue-800',
  Learning: 'bg-green-100 text-green-800',
  Sports: 'bg-amber-100 text-amber-800',
  Performance: 'bg-violet-100 text-violet-800',
  Exhibition: 'bg-pink-100 text-pink-800',
  Meeting: 'bg-cyan-100 text-cyan-800',
  General: 'bg-gray-100 text-gray-700',
};

/** Built locally so a UTC-parsed ISO string cannot slip a day. */
function parseDate(iso: string | null): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function formatFull(iso: string | null): string {
  const date = parseDate(iso);
  if (!date) return 'Date to be confirmed';
  return date.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function formatTime(time: string | null): string {
  if (!time) return '';
  const [h, min] = time.slice(0, 5).split(':').map(Number);
  if (h === undefined || Number.isNaN(h)) return '';
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(min ?? 0).padStart(2, '0')} ${suffix}`;
}

const EMPTY_FORM = {
  child_name: '', child_dob: '', parent_name: '', parent_email: '', parent_phone: '', message: '',
};

export default function EventDetailPage() {
  const phone = usePhone();
  const params = useParams();
  const id = String(params?.id ?? '');

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/events/${id}`);
      if (res.status === 404) { setNotFound(true); return; }
      if (!res.ok) throw new Error('failed');
      setEvent((await res.json()) as EventDetail);
    } catch {
      setNotFound(true);
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const full = event?.capacity != null && event.current_registrations >= event.capacity;
  const placesLeft = event?.capacity != null ? Math.max(0, event.capacity - event.current_registrations) : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.child_name.trim() || !form.parent_name.trim() || !form.parent_email.trim()
      || !form.parent_phone.trim() || !form.child_dob) {
      setError('Please fill in every required field.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API}/events/${id}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          child_name: form.child_name.trim(),
          child_dob: form.child_dob,
          parent_name: form.parent_name.trim(),
          parent_email: form.parent_email.trim(),
          parent_phone: form.parent_phone.trim(),
          message: form.message.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'We could not complete your booking.');
      }
      setConfirmed(true);
      setForm(EMPTY_FORM);
      setShowForm(false);
      await load(); // refresh the places-left count
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not complete your booking.');
    } finally { setSubmitting(false); }
  };

  const field = (key: keyof typeof EMPTY_FORM, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <>
      <Header />
      <main className="bg-white">
        {loading ? (
          <div className="mx-auto max-w-4xl px-4 py-20">
            <div className="h-72 animate-pulse rounded-lg bg-gray-100" />
          </div>
        ) : notFound || !event ? (
          <div className="mx-auto max-w-xl px-4 py-24 text-center">
            <h1 className="text-2xl font-bold text-gray-800">Event not found</h1>
            <p className="mt-3 text-base text-gray-600">
              This event may have finished or been taken down.
            </p>
            <div className="mt-6">
              <Button href="/events" variant="primary">See all events</Button>
            </div>
          </div>
        ) : (
          <>
            <section className="mx-auto max-w-4xl px-4 py-10 md:px-6 md:py-16">
              <Link href="/events" className="text-sm font-semibold text-red-600 underline hover:text-red-700">
                ← All events
              </Link>

              {event.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={cloudinaryResize(event.image_url, 800, 533)}
                  srcSet={buildSrcSet(event.image_url, WIDE_WIDTHS, { ratio: 2 / 3 })}
                  sizes='(max-width: 1024px) 100vw, 880px'
                  alt={event.title}
                  className="mt-5 aspect-3/2 w-full rounded-lg object-cover shadow-md"
                />
              )}

              <span
                className={`mt-6 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                  TYPE_STYLES[event.event_type] ?? TYPE_STYLES.General
                }`}
              >
                {event.event_type}
              </span>

              <h1 className="mt-3 text-3xl font-bold text-gray-800 md:text-4xl">{event.title}</h1>

              <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-lg bg-blue-50 p-4">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-gray-600">Date &amp; time</dt>
                  <dd className="mt-1 font-bold text-gray-800">{formatFull(event.event_date)}</dd>
                  {formatTime(event.event_time) && (
                    <dd className="mt-1 text-sm text-gray-700">
                      {formatTime(event.event_time)}
                      {formatTime(event.end_time) && ` – ${formatTime(event.end_time)}`}
                    </dd>
                  )}
                </div>

                {event.location && (
                  <div className="rounded-lg bg-green-50 p-4">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-gray-600">Location</dt>
                    <dd className="mt-1 font-bold text-gray-800">{event.location}</dd>
                  </div>
                )}

                {event.capacity != null && (
                  <div className="rounded-lg bg-amber-50 p-4">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-gray-600">Places</dt>
                    <dd className="mt-1 font-bold text-gray-800">
                      {full ? 'Fully booked' : `${placesLeft} of ${event.capacity} left`}
                    </dd>
                  </div>
                )}
              </dl>

              {event.age_groups && (
                <p className="mt-4 text-sm text-gray-600">
                  <span className="font-semibold">Suitable for:</span> {event.age_groups}
                </p>
              )}

              {event.description && (
                <p className="mt-6 whitespace-pre-line text-base leading-relaxed text-gray-700">
                  {event.description}
                </p>
              )}

              <div className="mt-8">
                {confirmed ? (
                  <div className="rounded-lg border border-green-300 bg-green-50 p-5">
                    <p className="font-semibold text-green-800">Your place is booked.</p>
                    <p className="mt-1 text-sm text-green-700">
                      We will confirm the details by email. If anything changes, call us on{' '}
                      <a href={telHref(phone)} className="font-semibold underline">{phone}</a>.
                    </p>
                  </div>
                ) : full ? (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-5">
                    <p className="font-semibold text-amber-900">This event is fully booked.</p>
                    <p className="mt-1 text-sm text-amber-800">
                      Call us on{' '}
                      <a href={telHref(phone)} className="font-semibold underline">{phone}</a>{' '}
                      to be added to the waiting list.
                    </p>
                  </div>
                ) : showForm ? (
                  <form onSubmit={submit} className="rounded-lg border border-gray-200 p-5 shadow-sm">
                    <h2 className="mb-4 text-lg font-bold text-gray-800">Book a place</h2>
                    {error && (
                      <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
                    )}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {([
                        ['child_name', "Child's name *", 'text'],
                        ['child_dob', "Child's date of birth *", 'date'],
                        ['parent_name', 'Your name *', 'text'],
                        ['parent_email', 'Email *', 'email'],
                        ['parent_phone', 'Phone *', 'tel'],
                      ] as const).map(([key, label, type]) => (
                        <label key={key} className="block">
                          <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
                          <input
                            type={type}
                            value={form[key]}
                            onChange={(e) => field(key, e.target.value)}
                            className="min-h-11 w-full rounded-lg border-2 border-gray-200 px-3 focus:border-red-600 focus:outline-none"
                            required
                          />
                        </label>
                      ))}
                    </div>
                    <label className="mt-4 block">
                      <span className="mb-1 block text-sm font-medium text-gray-700">Anything we should know?</span>
                      <textarea
                        rows={3}
                        value={form.message}
                        onChange={(e) => field('message', e.target.value)}
                        className="w-full rounded-lg border-2 border-gray-200 p-3 focus:border-red-600 focus:outline-none"
                      />
                    </label>
                    <div className="mt-5 flex gap-3">
                      <Button type="submit" variant="primary" disabled={submitting}>
                        {submitting ? 'Booking…' : 'Confirm booking'}
                      </Button>
                      <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : (
                  <Button variant="primary" size="lg" onClick={() => setShowForm(true)}>
                    Book a place
                  </Button>
                )}
              </div>
            </section>
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
