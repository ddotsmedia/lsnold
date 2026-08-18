'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { api } from '../../../lib/api';
import type { PaginatedResponse } from '../../../lib/api';
import { DataTable } from '../../../components/admin/DataTable';
import type { Column } from '../../../components/admin/DataTable';
import {
  SearchBar, Button, Modal, FormField, Input, Textarea, Select, Toast, ConfirmDialog,
} from '../../../components/admin/shared';

/* ------------------------------------------------------------------ types */

/** An announcement: a date and a body, nothing else. Table: news. */
interface NewsItem {
  id: string;
  title: string;
  description: string;
  published_date: string | null;
  is_published: boolean;
  image_url: string | null;
  created_at: string;
}

/** A dated happening with a time, a place and an audience. Table: news_events. */
interface EventItem {
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
  is_published: boolean;
  capacity: number | null;
  current_registrations: number;
  sort_order: number;
  created_at: string;
}

type Tab = 'news' | 'events';

/** The same set the public events page styles a badge for. */
const EVENT_TYPES = [
  'General', 'Celebration', 'Learning', 'Workshop',
  'Sports', 'Performance', 'Exhibition', 'Meeting',
] as const;

const TYPE_OPTIONS = EVENT_TYPES.map((t) => ({ value: t, label: t }));
const STATUS_OPTIONS = [
  { value: 'published', label: 'Published' },
  { value: 'draft', label: 'Draft' },
];

/* ------------------------------------------------------------------ forms */

interface NewsForm {
  title: string;
  description: string;
  published_date: string;
  is_published: boolean;
}

interface EventForm {
  title: string;
  description: string;
  event_date: string;
  event_time: string;
  end_time: string;
  location: string;
  event_type: string;
  age_groups: string;
  image_url: string;
  capacity: string;
  is_published: boolean;
}

const EMPTY_NEWS: NewsForm = {
  title: '', description: '', published_date: '', is_published: true,
};

const EMPTY_EVENT: EventForm = {
  title: '', description: '', event_date: '', event_time: '', end_time: '',
  location: '', event_type: 'General', age_groups: '', image_url: '', capacity: '', is_published: true,
};

type Errors = Record<string, string | undefined>;

/** Shared by both forms; the server enforces the same minimums. */
function validateCommon(title: string, description: string, date: string, dateKey: string): Errors {
  const errors: Errors = {};
  if (title.trim().length < 3) errors.title = 'Title must be at least 3 characters';
  else if (title.trim().length > 255) errors.title = 'Title must be 255 characters or fewer';
  if (description.trim().length < 10) errors.description = 'Description must be at least 10 characters';
  if (!date) errors[dateKey] = 'Date is required';
  return errors;
}

function validateNews(form: NewsForm): Errors {
  return validateCommon(form.title, form.description, form.published_date, 'published_date');
}

function validateEvent(form: EventForm): Errors {
  const errors = validateCommon(form.title, form.description, form.event_date, 'event_date');

  if (form.event_time && form.end_time && form.end_time <= form.event_time) {
    errors.end_time = 'End time must be after the start time';
  }
  if (form.image_url.trim()) {
    try { new URL(form.image_url.trim()); }
    catch { errors.image_url = 'Must be a valid URL, e.g. https://example.com/photo.jpg'; }
  }
  return errors;
}

/** A date column can arrive as YYYY-MM-DD or as a full timestamp. */
const toDateInput = (v: string | null | undefined) => (v ? v.slice(0, 10) : '');
const toTimeInput = (v: string | null | undefined) => (v ? v.slice(0, 5) : '');

const formatDate = (v: string | null) =>
  v ? new Date(`${v.slice(0, 10)}T00:00:00`).toLocaleDateString() : '—';

/* ------------------------------------------------------------- components */

function StatusPill({ published }: { published: boolean }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border ${
      published
        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
        : 'bg-zinc-500/10 text-panel-body border-zinc-500/30'
    }`}>
      {published ? 'Published' : 'Draft'}
    </span>
  );
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex gap-1">
      <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); onEdit(); }}>Edit</Button>
      <Button size="sm" variant="danger" onClick={(e) => { e.stopPropagation(); onDelete(); }}>Delete</Button>
    </div>
  );
}

/* ------------------------------------------------------------------- page */

export default function NewsAndEventsPage() {
  const [tab, setTab] = useState<Tab>('news');
  const [search, setSearch] = useState('');

  const [news, setNews] = useState<NewsItem[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [newsPage, setNewsPage] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [eventsPage, setEventsPage] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // One featured image per news item. The file is held here until the item has
  // an id to attach it to, since a new item is created before it has one.
  const [newsImageFile, setNewsImageFile] = useState<File | null>(null);
  const [newsImagePreview, setNewsImagePreview] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [newsForm, setNewsForm] = useState<NewsForm>(EMPTY_NEWS);
  const [eventForm, setEventForm] = useState<EventForm>(EMPTY_EVENT);
  const [errors, setErrors] = useState<Errors>({});

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; tab: Tab } | null>(null);

  /** Which row a drag started on. A ref, not state — see rowProps below. */
  const dragFrom = useRef<number | null>(null);

  const isNews = tab === 'news';

  /* ---------------------------------------------------------- data loading */

  const fetchData = useCallback(async (which: Tab, page = 1) => {
    setLoading(true);
    setLoadError(null);
    try {
      if (which === 'news') {
        const res = await api<PaginatedResponse<NewsItem>>('/admin/news', {
          params: { page, limit: 20, search },
        });
        setNews(res.data);
        setNewsPage(res.pagination);
      } else {
        const res = await api<PaginatedResponse<EventItem>>('/admin/events', {
          params: { page, limit: 20, search },
        });
        setEvents(res.data);
        setEventsPage(res.pagination);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load';
      setLoadError(message);
      setToast({ message: `Failed to load ${which}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [search]);

  // Refetches on tab change and on search, so the query applies to whichever
  // list is showing.
  useEffect(() => { fetchData(tab, 1); }, [fetchData, tab]);

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }
  }, [toast]);

  /* ---------------------------------------------------------------- modals */

  const openCreate = () => {
    setEditId(null);
    setNewsForm(EMPTY_NEWS);
    setEventForm(EMPTY_EVENT);
    clearNewsImage();
    setErrors({});
    setShowModal(true);
  };

  const openEditNews = (item: NewsItem) => {
    setEditId(item.id);
    setNewsForm({
      title: item.title,
      description: item.description || '',
      published_date: toDateInput(item.published_date),
      is_published: item.is_published !== false,
    });
    // The saved image, if any, so the picker shows what is currently set.
    setNewsImageFile(null);
    setNewsImagePreview(item.image_url ?? null);
    setErrors({});
    setShowModal(true);
  };

  const openEditEvent = (item: EventItem) => {
    setEditId(item.id);
    setEventForm({
      title: item.title,
      description: item.description || '',
      event_date: toDateInput(item.event_date),
      event_time: toTimeInput(item.event_time),
      end_time: toTimeInput(item.end_time),
      location: item.location || '',
      event_type: item.event_type || 'General',
      age_groups: item.age_groups || '',
      image_url: item.image_url || '',
      capacity: item.capacity == null ? '' : String(item.capacity),
      is_published: item.is_published !== false,
    });
    setErrors({});
    setShowModal(true);
  };

  const closeModal = () => {
    if (saving) return;
    setShowModal(false);
    setEditId(null);
    setErrors({});
  };

  /* ---------------------------------------------------------- news image */

  const clearNewsImage = () => {
    setNewsImagePreview((old) => { if (old?.startsWith('blob:')) URL.revokeObjectURL(old); return null; });
    setNewsImageFile(null);
  };

  /** Validates and previews. The upload itself waits until the item is saved. */
  const pickNewsImage = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setToast({ message: 'Please choose an image file', type: 'error' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setToast({ message: 'Image must be 10 MB or smaller', type: 'error' });
      return;
    }
    setNewsImageFile(file);
    setNewsImagePreview((old) => {
      if (old?.startsWith('blob:')) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });
  };

  const uploadNewsImage = async (id: string, file: File): Promise<void> => {
    const form = new FormData();
    form.append('image', file);
    const token = localStorage.getItem('lsn_token');
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/news/${id}/image`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error || `Upload failed (${res.status})`);
    }
  };

  /** Removes the image from an already-saved item. */
  const removeSavedNewsImage = async () => {
    if (!editId) { clearNewsImage(); return; }
    setImageBusy(true);
    try {
      const token = localStorage.getItem('lsn_token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/news/${editId}/image`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      clearNewsImage();
      setToast({ message: 'Image removed', type: 'success' });
      fetchData('news', newsPage.page);
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Failed to remove image', type: 'error' });
    } finally { setImageBusy(false); }
  };

  /* --------------------------------------------------------- event image */

  const fail = (message: string) => setToast({ message, type: 'error' });

  /** Uploads to Cloudinary. Needs a saved event, since the image keys to its id. */
  const uploadEventImage = async (file: File | undefined) => {
    if (!file || !editId) return;
    if (!file.type.startsWith('image/')) { fail('Please choose an image file'); return; }
    if (file.size > 10 * 1024 * 1024) { fail('Image must be 10 MB or smaller'); return; }

    setImageBusy(true);
    try {
      const body = new FormData();
      body.append('image', file);
      const token = localStorage.getItem('lsn_token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/events/${editId}/image`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body,
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || `Upload failed (${res.status})`);
      }
      const data = (await res.json()) as { imageUrl?: string };
      if (data.imageUrl) setEventForm((f) => ({ ...f, image_url: data.imageUrl as string }));
      setToast({ message: 'Image uploaded', type: 'success' });
      fetchData('events', eventsPage.page);
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Upload failed');
    } finally { setImageBusy(false); }
  };

  const removeEventImage = async () => {
    if (!editId) return;
    setImageBusy(true);
    try {
      const token = localStorage.getItem('lsn_token');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/events/${editId}/image`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      setEventForm((f) => ({ ...f, image_url: '' }));
      setToast({ message: 'Image removed', type: 'success' });
      fetchData('events', eventsPage.page);
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Failed to remove image');
    } finally { setImageBusy(false); }
  };

  /** Persists drag-to-reorder for the events list. */
  const commitEventOrder = async (from: number, to: number) => {
    if (from === to) return;
    const next = [...events];
    const [moved] = next.splice(from, 1);
    if (moved) next.splice(to, 0, moved);
    setEvents(next); // optimistic
    try {
      await api('/admin/events/reorder', {
        method: 'POST',
        body: JSON.stringify({
          ids: next.map((e) => e.id),
          // Positions are absolute, so page 2 must not restart at zero.
          start: (eventsPage.page - 1) * eventsPage.limit,
        }),
      });
      setToast({ message: 'Order saved', type: 'success' });
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Failed to save order');
      fetchData('events', eventsPage.page);
    }
  };

  /* ----------------------------------------------------------------- save */

  const save = async () => {
    const found = isNews ? validateNews(newsForm) : validateEvent(eventForm);
    setErrors(found);
    if (Object.values(found).some(Boolean)) {
      setToast({ message: 'Please fix the highlighted fields', type: 'error' });
      return;
    }

    const path = isNews ? '/admin/news' : '/admin/events';
    const body = isNews
      ? {
          title: newsForm.title.trim(),
          description: newsForm.description.trim(),
          published_date: newsForm.published_date,
          is_published: newsForm.is_published,
        }
      : {
          title: eventForm.title.trim(),
          description: eventForm.description.trim(),
          event_date: eventForm.event_date,
          event_time: eventForm.event_time || null,
          end_time: eventForm.end_time || null,
          location: eventForm.location.trim() || null,
          event_type: eventForm.event_type,
          age_groups: eventForm.age_groups.trim() || null,
          image_url: eventForm.image_url.trim() || null,
          capacity: eventForm.capacity === '' ? null : Number(eventForm.capacity),
          is_published: eventForm.is_published,
        };

    setSaving(true);
    try {
      let savedId = editId;
      if (editId) {
        await api(`${path}/${editId}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        const created = await api<{ id: string }>(path, { method: 'POST', body: JSON.stringify(body) });
        savedId = created?.id ?? null;
      }

      // The image is attached after the item exists, since the endpoint keys it
      // to the item's id. A failure here is reported but does not discard the
      // item that was just saved.
      if (isNews && newsImageFile && savedId) {
        try {
          await uploadNewsImage(savedId, newsImageFile);
        } catch (err) {
          setToast({
            message: `Saved, but the image failed: ${err instanceof Error ? err.message : 'upload error'}`,
            type: 'error',
          });
          setShowModal(false);
          setEditId(null);
          setNewsForm(EMPTY_NEWS);
          clearNewsImage();
          fetchData(tab, editId ? (isNews ? newsPage.page : eventsPage.page) : 1);
          setSaving(false);
          return;
        }
      }

      setToast({
        message: `${isNews ? 'News item' : 'Event'} ${editId ? 'updated' : 'created'}`,
        type: 'success',
      });
      setShowModal(false);
      setEditId(null);
      setNewsForm(EMPTY_NEWS);
      setEventForm(EMPTY_EVENT);
      // Back to page 1 after a create: both lists are date-ordered, so a new
      // row will not necessarily be on whichever page is open.
      const current = isNews ? newsPage.page : eventsPage.page;
      fetchData(tab, editId ? current : 1);
    } catch (err) {
      // Surfaces the server's own message so a rejected field is actionable.
      setToast({ message: err instanceof Error ? err.message : 'Failed to save', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const { id, tab: which } = confirmDelete;
    setConfirmDelete(null);
    try {
      await api(`${which === 'news' ? '/admin/news' : '/admin/events'}/${id}`, { method: 'DELETE' });
      setToast({ message: `${which === 'news' ? 'News item' : 'Event'} deleted`, type: 'success' });
      fetchData(which, which === 'news' ? newsPage.page : eventsPage.page);
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Failed to delete', type: 'error' });
    }
  };

  const setNewsField = <K extends keyof NewsForm>(key: K, value: NewsForm[K]) => {
    setNewsForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  };

  const setEventField = <K extends keyof EventForm>(key: K, value: EventForm[K]) => {
    setEventForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  };

  /* -------------------------------------------------------------- columns */

  const newsColumns: Column<NewsItem>[] = [
    { key: 'title', header: 'Title', sortable: true, render: (r) => <span className="font-medium">{r.title}</span> },
    { key: 'published_date', header: 'Date', render: (r) => <span className="text-xs text-panel-body">{formatDate(r.published_date)}</span> },
    { key: 'is_published', header: 'Status', render: (r) => <StatusPill published={r.is_published} /> },
    {
      key: 'actions', header: '', className: 'w-[150px]',
      render: (r) => <RowActions onEdit={() => openEditNews(r)} onDelete={() => setConfirmDelete({ id: r.id, tab: 'news' })} />,
    },
  ];

  const eventColumns: Column<EventItem>[] = [
    {
      key: 'drag', header: '', className: 'w-8',
      render: () => <span className="cursor-grab select-none text-panel-faint" aria-hidden>⠿</span>,
    },
    {
      key: 'title', header: 'Title', sortable: true,
      render: (r) => (
        <span className="flex items-center gap-2">
          {r.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.image_url} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
          )}
          <span className="font-medium">{r.title}</span>
        </span>
      ),
    },
    { key: 'event_date', header: 'Date', render: (r) => <span className="text-xs text-panel-body">{formatDate(r.event_date)}</span> },
    {
      key: 'event_type', header: 'Type',
      render: (r) => (
        <span className="text-xs px-2 py-0.5 rounded-full bg-panel-raised text-panel-body">
          {r.event_type || 'General'}
        </span>
      ),
    },
    {
      key: 'capacity', header: 'Bookings',
      render: (r) => {
        const booked = r.current_registrations ?? 0;
        if (r.capacity == null) {
          return <span className="text-xs text-panel-muted">{booked} · no limit</span>;
        }
        const full = booked >= r.capacity;
        return (
          <span className={`text-xs ${full ? 'text-amber-400' : 'text-panel-body'}`}>
            {booked} / {r.capacity}{full ? ' · full' : ''}
          </span>
        );
      },
    },
    { key: 'is_published', header: 'Status', render: (r) => <StatusPill published={r.is_published} /> },
    {
      key: 'actions', header: '', className: 'w-[150px]',
      render: (r) => <RowActions onEdit={() => openEditEvent(r)} onDelete={() => setConfirmDelete({ id: r.id, tab: 'events' })} />,
    },
  ];

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: 'news', label: 'News', count: newsPage.total },
    { key: 'events', label: 'Events', count: eventsPage.total },
  ];

  /* --------------------------------------------------------------- render */

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-panel-line" role="tablist" aria-label="Content type">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.key)}
              className={`relative px-5 py-3 text-sm font-medium transition-colors duration-200 border-b-2 -mb-px focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 rounded-t-lg ${
                active
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-panel-muted hover:text-panel-body hover:border-panel-line-2'
              }`}
            >
              {t.label}
              {t.count > 0 && (
                <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full transition-colors ${
                  active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-panel-raised text-panel-muted'
                }`}>
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Search + add */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:max-w-xs">
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder={isNews ? 'Search news...' : 'Search events...'}
          />
        </div>
        <Button onClick={openCreate} className="w-full sm:w-auto shrink-0">
          {isNews ? '+ Add News' : '+ Add Event'}
        </Button>
      </div>

      {loadError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {loadError}{' '}
          <button onClick={() => fetchData(tab, 1)} className="underline hover:text-red-300">
            Retry
          </button>
        </div>
      )}

      {/* Only the active tab's table is mounted, so the two never disagree. */}
      <div key={tab} className="animate-in fade-in duration-200">
        {isNews ? (
          <DataTable
            columns={newsColumns}
            data={news}
            loading={loading}
            pagination={newsPage}
            onPageChange={(p) => fetchData('news', p)}
            emptyMessage={search ? 'No news matches that search.' : 'No news yet. Use “+ Add News” to publish the first item.'}
          />
        ) : (
          <>
          {events.length > 1 && (
            <p className="mb-2 text-xs text-panel-muted">
              Drag a row to change the order events appear in on the public page.
            </p>
          )}
          <DataTable
            columns={eventColumns}
            data={events}
            loading={loading}
            pagination={eventsPage}
            onPageChange={(p) => fetchData('events', p)}
            emptyMessage={search ? 'No events match that search.' : 'No events yet. Use “+ Add Event” to create one.'}
            rowProps={(_row, index) => ({
              draggable: true,
              // The index has to come from a ref: onDrop fires before a state
              // update from onDragStart would have re-rendered.
              onDragStart: () => { dragFrom.current = index; },
              onDragOver: (e) => e.preventDefault(),
              onDrop: () => {
                const from = dragFrom.current;
                dragFrom.current = null;
                if (from !== null) void commitEventOrder(from, index);
              },
              onDragEnd: () => { dragFrom.current = null; },
              className: 'cursor-grab active:cursor-grabbing',
            })}
          />
          </>
        )}
      </div>

      {/* Create / edit */}
      <Modal
        open={showModal}
        onClose={closeModal}
        title={`${editId ? 'Edit' : 'Add'} ${isNews ? 'News' : 'Event'}`}
        maxWidth={isNews ? 'max-w-xl' : 'max-w-2xl'}
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
          {isNews ? (
            <>
              <FormField label="Title *" error={errors.title}>
                <Input
                  value={newsForm.title}
                  onChange={(e) => setNewsField('title', e.target.value)}
                  placeholder="New playground opens"
                  maxLength={255}
                />
              </FormField>

              <FormField label="Description *" error={errors.description}>
                <Textarea
                  value={newsForm.description}
                  onChange={(e) => setNewsField('description', e.target.value)}
                  rows={7}
                  placeholder="What would you like parents to know?"
                />
              </FormField>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label="Date *" error={errors.published_date}>
                  <Input
                    type="date"
                    value={newsForm.published_date}
                    onChange={(e) => setNewsField('published_date', e.target.value)}
                  />
                </FormField>
                <FormField label="Status">
                  <Select
                    value={newsForm.is_published ? 'published' : 'draft'}
                    onChange={(e) => setNewsField('is_published', e.target.value === 'published')}
                    options={STATUS_OPTIONS}
                  />
                </FormField>
              </div>

              <FormField label="Featured image">
                <div className="space-y-2">
                  {newsImagePreview && (
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={newsImagePreview}
                        alt="Featured image preview"
                        className="h-40 w-full rounded-lg border border-panel-line object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => void removeSavedNewsImage()}
                        disabled={imageBusy}
                        aria-label="Remove image"
                        className="absolute right-2 top-2 rounded bg-red-500/80 px-2 py-0.5 text-xs text-white hover:bg-red-500 disabled:opacity-50"
                      >
                        {imageBusy ? '…' : '✕'}
                      </button>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => pickNewsImage(e.target.files?.[0])}
                    className="block w-full cursor-pointer rounded-lg border border-panel-line bg-panel-sunken p-2 text-sm text-panel-body file:mr-3 file:rounded file:border-0 file:bg-panel-raised file:px-3 file:py-1 file:text-xs file:text-panel-strong"
                  />
                  <p className="text-xs text-panel-faint">
                    Shown on the public News section. Landscape works best — around 1200×600. Max 10 MB.
                    {newsImageFile && !editId && ' Uploaded once the item is created.'}
                  </p>
                </div>
              </FormField>
            </>
          ) : (
            <>
              <FormField label="Title *" error={errors.title}>
                <Input
                  value={eventForm.title}
                  onChange={(e) => setEventField('title', e.target.value)}
                  placeholder="End of Year Celebration"
                  maxLength={255}
                />
              </FormField>

              <FormField label="Description *" error={errors.description}>
                <Textarea
                  value={eventForm.description}
                  onChange={(e) => setEventField('description', e.target.value)}
                  rows={5}
                  placeholder="What is planned?"
                />
              </FormField>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <FormField label="Date *" error={errors.event_date}>
                  <Input type="date" value={eventForm.event_date} onChange={(e) => setEventField('event_date', e.target.value)} />
                </FormField>
                <FormField label="Start Time" error={errors.event_time}>
                  <Input type="time" value={eventForm.event_time} onChange={(e) => setEventField('event_time', e.target.value)} />
                </FormField>
                <FormField label="End Time" error={errors.end_time}>
                  <Input type="time" value={eventForm.end_time} onChange={(e) => setEventField('end_time', e.target.value)} />
                </FormField>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label="Category">
                  <Select
                    value={eventForm.event_type}
                    onChange={(e) => setEventField('event_type', e.target.value)}
                    options={TYPE_OPTIONS}
                  />
                </FormField>
                <FormField label="Status">
                  <Select
                    value={eventForm.is_published ? 'published' : 'draft'}
                    onChange={(e) => setEventField('is_published', e.target.value === 'published')}
                    options={STATUS_OPTIONS}
                  />
                </FormField>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label="Location">
                  <Input value={eventForm.location} onChange={(e) => setEventField('location', e.target.value)} placeholder="Main Hall" maxLength={255} />
                </FormField>
                <FormField label="Age Groups">
                  <Input value={eventForm.age_groups} onChange={(e) => setEventField('age_groups', e.target.value)} placeholder="All ages" maxLength={255} />
                </FormField>
              </div>

              <FormField label="Capacity">
                <Input
                  type="number"
                  min={0}
                  value={eventForm.capacity}
                  onChange={(e) => setEventField('capacity', e.target.value)}
                  placeholder="Leave blank for unlimited"
                />
                {editId && (
                  <p className="mt-1 text-xs text-panel-faint">
                    {events.find((e) => e.id === editId)?.current_registrations ?? 0} booked so far.
                    Bookings are counted automatically and cannot exceed this number.
                  </p>
                )}
              </FormField>

              {/* An image can only be uploaded once the event has an id, so a
                  new event takes a URL and an existing one takes a file. */}
              {editId ? (
                <FormField label="Event image">
                  <div className="space-y-2">
                    {eventForm.image_url.trim() && (
                      <div className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={eventForm.image_url}
                          alt=""
                          className="h-36 w-full rounded-lg border border-panel-line object-cover"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                        <button
                          type="button"
                          onClick={() => void removeEventImage()}
                          disabled={imageBusy}
                          aria-label="Remove image"
                          className="absolute right-2 top-2 rounded bg-red-500/80 px-2 py-0.5 text-xs text-white hover:bg-red-500 disabled:opacity-50"
                        >
                          {imageBusy ? '…' : '✕'}
                        </button>
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => void uploadEventImage(e.target.files?.[0])}
                      className="block w-full cursor-pointer rounded-lg border border-panel-line bg-panel-sunken p-2 text-sm text-panel-body file:mr-3 file:rounded file:border-0 file:bg-panel-raised file:px-3 file:py-1 file:text-xs file:text-panel-strong"
                    />
                    <p className="text-xs text-panel-faint">Uploaded to Cloudinary. Max 10 MB.</p>
                  </div>
                </FormField>
              ) : (
                <FormField label="Image URL" error={errors.image_url}>
                  <Input
                    value={eventForm.image_url}
                    onChange={(e) => setEventField('image_url', e.target.value)}
                    placeholder="https://… — or save first, then upload a file"
                  />
                </FormField>
              )}
              {eventForm.image_url.trim() && !errors.image_url && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={eventForm.image_url.trim()}
                  alt=""
                  className="h-28 w-full rounded-lg border border-panel-line object-cover"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              )}
            </>
          )}

          <div className="flex justify-end gap-2 border-t border-panel-line/50 pt-4">
            <Button variant="secondary" onClick={closeModal} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving
                ? 'Saving…'
                : editId
                  ? 'Save Changes'
                  : isNews ? 'Create News' : 'Create Event'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        title={`Delete ${confirmDelete?.tab === 'news' ? 'News Item' : 'Event'}`}
        message="This moves the item to the recycle bin, where it can be restored."
        confirmLabel="Delete"
        destructive
      />
      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}
