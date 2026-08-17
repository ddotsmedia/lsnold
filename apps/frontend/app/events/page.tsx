'use client';

import { useCallback, useEffect, useState } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { PageSections, usePageSections } from '@/components/PageSections';
import { EditableProse, EditableHeading, sectionMap } from '@/lib/renderPageSection';
import { PageFeatureImages } from '@/components/PageFeatureImages';
import { HeroBackground } from '@/components/HeroBackground';
import { usePageMedia } from '@/lib/media';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/Button';
import Link from 'next/link';

interface ApiEvent {
  id: string;
  title: string;
  description?: string | null;
  event_date: string | null;
  event_time: string | null;
  end_time: string | null;
  location?: string | null;
  image_url?: string | null;
  event_type: string;
  age_groups?: string | null;
  capacity?: number | null;
  current_registrations?: number;
}

/** A news item: an announcement with a date and a body, no time or place. */
interface ApiNews {
  id: string;
  title: string;
  description: string;
  published_date: string | null;
  image_url?: string | null;
}

const API = process.env.NEXT_PUBLIC_API_URL;

/** The categories in use, matching the admin Events tab. */
const CATEGORIES = [
  'Celebration', 'Learning', 'Workshop', 'Sports', 'Performance', 'Exhibition', 'Meeting',
] as const;

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

/** Builds the date locally so a UTC-parsed ISO string cannot slip a day. */
function parseDate(iso: string | null): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function formatDay(iso: string | null): { day: string; month: string } {
  const date = parseDate(iso);
  if (!date) return { day: '–', month: '' };
  return {
    day: String(date.getDate()),
    month: date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
  };
}

function formatFull(iso: string | null): string {
  const date = parseDate(iso);
  if (!date) return 'Date to be confirmed';
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
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

function timeRange(e: ApiEvent): string {
  const start = formatTime(e.event_time);
  const end = formatTime(e.end_time);
  if (!start) return '';
  return end ? `${start} – ${end}` : start;
}

function EventCard({ event, past, onOpen }: { event: ApiEvent; past: boolean; onOpen: () => void }) {
  const { day, month } = formatDay(event.event_date);
  return (
    <article
      onClick={onOpen}
      className="relative flex h-full cursor-pointer flex-col overflow-hidden rounded-lg bg-white shadow-md transition-all duration-200 hover:shadow-lg focus-within:ring-2 focus-within:ring-blue-800 md:hover:scale-105"
    >
      <div className="relative">
        {event.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.image_url}
            alt={event.title}
            loading="lazy"
            className={`aspect-3/2 w-full object-cover ${past ? 'grayscale' : ''}`}
          />
        ) : (
          <div className="aspect-3/2 w-full bg-gradient-to-br from-blue-100 to-blue-200" />
        )}
        <div className="absolute right-3 top-3 flex h-14 w-14 flex-col items-center justify-center rounded-lg bg-red-600 text-white shadow">
          <span className="text-xl font-bold leading-none">{day}</span>
          <span className="mt-0.5 text-[10px] font-semibold leading-none">{month}</span>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4 md:p-5">
        {past && (
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            Event completed
          </p>
        )}
        <h3 className="mb-2 text-lg font-bold text-gray-800 md:text-xl">{event.title}</h3>
        <span
          className={`mb-3 inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold ${
            TYPE_STYLES[event.event_type] ?? TYPE_STYLES.General
          }`}
        >
          {event.event_type}
        </span>
        {event.description && (
          <p className="mb-4 line-clamp-3 text-sm leading-relaxed text-gray-700">
            {event.description}
          </p>
        )}
        {event.capacity != null && (
          <p className="mb-3 text-xs font-medium text-gray-500">
            {event.current_registrations != null && event.current_registrations >= event.capacity
              ? 'Fully booked'
              : `${event.capacity - (event.current_registrations ?? 0)} of ${event.capacity} places left`}
          </p>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-3">
          <Button variant="secondary" size="sm" ariaLabel={`Quick look at ${event.title}`}>
            {past ? 'View Details' : 'Learn More'}
          </Button>
          {/* A real link, so an event can be opened in a new tab, shared and
              found by search engines. The modal alone has no address. */}
          <Link
            href={`/events/${event.id}`}
            onClick={(e) => e.stopPropagation()}
            className="text-sm font-semibold text-red-600 underline hover:text-red-700"
          >
            Full details
          </Link>
        </div>
      </div>
    </article>
  );
}

/**
 * A news item may carry one featured image. Without one the card stays
 * text-led, which is how every existing item reads.
 */
function NewsCard({ item, onOpen }: { item: ApiNews; onOpen: () => void }) {
  return (
    <article
      onClick={onOpen}
      className="flex h-full cursor-pointer flex-col overflow-hidden rounded-lg bg-white shadow-md transition-all duration-200 hover:shadow-lg focus-within:ring-2 focus-within:ring-blue-800 md:hover:scale-[1.02]"
    >
      {item.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.image_url}
          alt={item.title}
          loading="lazy"
          className="aspect-3/2 w-full object-cover"
        />
      )}

      <div className="flex flex-1 flex-col p-5 md:p-6">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-600">
        {formatFull(item.published_date)}
      </p>
      <h3 className="mb-2 text-lg font-bold text-gray-800 md:text-xl">{item.title}</h3>
      <p className="line-clamp-4 flex-1 text-base leading-relaxed text-gray-700">
        {item.description}
      </p>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onOpen(); }}
        className="mt-4 self-start text-sm font-semibold text-red-600 underline hover:text-red-700"
      >
        Read more
      </button>
      </div>
    </article>
  );
}

function EventGrid({
  events,
  past,
  onOpen,
}: {
  events: ApiEvent[];
  past: boolean;
  onOpen: (e: ApiEvent) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:gap-8 lg:grid-cols-3">
      {events.map((e) => (
        <EventCard key={e.id} event={e} past={past} onOpen={() => onOpen(e)} />
      ))}
    </div>
  );
}

export default function EventsPage() {
  // Images uploaded in admin -> Media Library -> Pages -> News & Events. The
  // pages row is 'news-events', which is the slug page_media stores under.
  const pageImages = usePageMedia('news-events');
  // Text written in admin -> Pages -> Text, keyed by section.
  const sections = sectionMap(usePageSections('news-events'));
  const [upcoming, setUpcoming] = useState<ApiEvent[]>([]);
  const [news, setNews] = useState<ApiNews[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<ApiEvent | null>(null);
  const [selectedNews, setSelectedNews] = useState<ApiNews | null>(null);
  // Category filter for the upcoming list. '' means every category.
  const [category, setCategory] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      // News is its own content type now, managed on the News tab of the admin
      // panel. This section used to show past events instead.
      const [u, n] = await Promise.all([
        fetch(`${API}/events?scope=upcoming${category ? `&category=${encodeURIComponent(category)}` : ''}`)
          .then((r) => (r.ok ? r.json() : Promise.reject())),
        fetch(`${API}/news`).then((r) => (r.ok ? r.json() : Promise.reject())),
      ]);
      setUpcoming(Array.isArray(u) ? u : []);
      setNews(Array.isArray(n) ? n : []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    void load();
  }, [load]);

  const open = (e: ApiEvent): void => setSelected(e);

  return (
    <>
      <Header />
      <main className="bg-white">
        <section
          aria-labelledby="events-hero"
          className="relative overflow-hidden bg-gradient-to-br from-blue-500 to-red-600 px-4 py-12 text-center md:py-16"
        >
          <HeroBackground image={pageImages.hero} />
          <div className="relative z-10">
            <h1 id="events-hero" className="text-3xl font-bold text-white md:text-4xl lg:text-5xl">
              Events &amp; Programs
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-base text-blue-50 md:text-lg">
              Join us for exciting learning experiences
            </p>
          </div>
        </section>

        {/* admin -> Pages -> News & Events -> Text. Renders nothing until a
            section is published, so the page is unchanged by default. */}
        <section className="mx-auto max-w-4xl px-4 empty:hidden md:px-6">
          <EditableHeading sections={sections} sectionKey="intro" className="mb-3 text-2xl font-bold text-gray-800 md:text-3xl">{null}</EditableHeading>
          <EditableProse sections={sections} sectionKey="intro">{null}</EditableProse>
          <EditableProse sections={sections} sectionKey="body">{null}</EditableProse>
        </section>

        {loading ? (
          <section className="mx-auto max-w-6xl px-4 py-12 md:px-6">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="h-80 animate-pulse rounded-lg bg-gray-100" />
              ))}
            </div>
          </section>
        ) : error ? (
          <section className="mx-auto max-w-xl px-4 py-16 text-center">
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-5">
              <p className="text-sm text-amber-800">
                We couldn&rsquo;t load our events just now. Please try again, or call us on{' '}
                <a href="tel:+971562677747" className="font-semibold underline">
                  +971 56 267 7747
                </a>
                .
              </p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-3 min-h-11 rounded-lg bg-amber-600 px-4 text-sm font-semibold text-white hover:bg-amber-700"
              >
                Try again
              </button>
            </div>
          </section>
        ) : (
          <>
            <section aria-labelledby="upcoming-heading" className="py-12 md:py-20">
              <div className="mx-auto max-w-6xl px-4 md:px-6">
                <h2
                  id="upcoming-heading"
                  className="mb-8 text-center text-2xl font-bold text-gray-800 md:text-3xl lg:text-4xl"
                >
                  Upcoming Events
                </h2>

                {/* Category filter. The list is refetched rather than filtered
                    in the browser, so it stays correct however many events
                    there eventually are. */}
                <div className="mb-8 flex flex-wrap justify-center gap-2">
                  {[{ value: '', label: 'All' }, ...CATEGORIES.map((c) => ({ value: c, label: c }))].map(
                    (option) => (
                      <button
                        key={option.value || 'all'}
                        type="button"
                        onClick={() => setCategory(option.value)}
                        aria-pressed={category === option.value}
                        className={`min-h-11 rounded-full px-4 text-sm font-semibold transition-colors ${
                          category === option.value
                            ? 'bg-red-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {option.label}
                      </button>
                    )
                  )}
                </div>

                {upcoming.length === 0 ? (
                  <p className="text-center text-base text-gray-600">
                    {category
                      ? `Nothing scheduled under ${category} right now.`
                      : 'Nothing scheduled right now — check back soon.'}
                  </p>
                ) : (
                  <EventGrid events={upcoming} past={false} onOpen={open} />
                )}
              </div>
            </section>

            {news.length > 0 && (
              <section aria-labelledby="news-heading" className="bg-gray-100 py-12 md:py-20">
                <div className="mx-auto max-w-6xl px-4 md:px-6">
                  <h2
                    id="news-heading"
                    className="mb-8 text-center text-2xl font-bold text-gray-800 md:text-3xl lg:text-4xl"
                  >
                    News
                  </h2>
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {news.map((item) => (
                      <NewsCard key={item.id} item={item} onOpen={() => setSelectedNews(item)} />
                    ))}
                  </div>
                </div>
              </section>
            )}
          </>
        )}
        {/* Text written in admin -> Pages -> Text. Renders nothing until a
            section has content, so the copy above is untouched by default. */}
        <PageFeatureImages images={pageImages} className="bg-white py-16 md:py-24" />

        <PageSections pageSlug="news-events" />

      </main>
      <Footer />

      <Modal
        isOpen={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.title ?? ''}
        size="lg"
      >
        {selected && (
          <div>
            {selected.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selected.image_url}
                alt={selected.title}
                className="mb-5 aspect-3/2 w-full rounded-lg object-cover"
              />
            )}

            <span
              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                TYPE_STYLES[selected.event_type] ?? TYPE_STYLES.General
              }`}
            >
              {selected.event_type}
            </span>

            <dl className="mt-4 space-y-2 text-base text-gray-700">
              <div className="flex gap-2">
                <dt aria-hidden="true">📅</dt>
                <dd>
                  {formatFull(selected.event_date)}
                  {timeRange(selected) && ` · ${timeRange(selected)}`}
                </dd>
              </div>
              {selected.location && (
                <div className="flex gap-2">
                  <dt aria-hidden="true">📍</dt>
                  <dd>{selected.location}</dd>
                </div>
              )}
              {selected.age_groups && (
                <div className="flex gap-2">
                  <dt aria-hidden="true">👥</dt>
                  <dd>{selected.age_groups}</dd>
                </div>
              )}
            </dl>

            {selected.description && (
              <p className="mt-5 text-base leading-relaxed text-gray-700">{selected.description}</p>
            )}

            <div className="mt-8 border-t border-gray-100 pt-5">
              <Button href="/booking" variant="primary" size="lg">
                Book a Visit
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={selectedNews !== null}
        onClose={() => setSelectedNews(null)}
        title={selectedNews?.title ?? ''}
        size="lg"
      >
        {selectedNews && (
          <div>
            {selectedNews.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selectedNews.image_url}
                alt={selectedNews.title}
                className="mb-5 aspect-3/2 w-full rounded-lg object-cover"
              />
            )}
            <p className="text-sm font-semibold uppercase tracking-wide text-red-600">
              {formatFull(selectedNews.published_date)}
            </p>
            {/* whitespace-pre-line so paragraph breaks typed in the admin
                textarea survive to the page. */}
            <p className="mt-4 whitespace-pre-line text-base leading-relaxed text-gray-700">
              {selectedNews.description}
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}
