'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import type { PaginatedResponse } from '../../../lib/api';
import { Toast } from '../../../components/admin/shared';

interface DeletedImage {
  id: string;
  title: string;
  image_url: string;
  category_name: string | null;
  deleted_at: string;
}

interface DeletedCategory {
  id: string;
  name: string;
  slug: string;
  deleted_at: string;
}

interface DeletedEvent {
  id: string;
  title: string;
  event_date: string | null;
  deleted_at: string;
}

type Tab = 'images' | 'categories' | 'events';

function when(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

export default function RecycleBinPage() {
  const [tab, setTab] = useState<Tab>('images');
  const [images, setImages] = useState<DeletedImage[]>([]);
  const [categories, setCategories] = useState<DeletedCategory[]>([]);
  const [events, setEvents] = useState<DeletedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [gallery, ev] = await Promise.all([
        api<{ images: DeletedImage[]; categories: DeletedCategory[] }>('/admin/gallery/deleted'),
        api<PaginatedResponse<DeletedEvent>>('/admin/content/events', {
          params: { deleted: 'true', limit: 100 },
        }),
      ]);
      setImages(gallery.images ?? []);
      setCategories(gallery.categories ?? []);
      setEvents(ev.data ?? []);
    } catch {
      setToast({ message: 'Failed to load deleted items', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const restore = async (path: string, id: string, label: string): Promise<void> => {
    setBusy(id);
    try {
      await api(path, { method: 'POST' });
      setToast({ message: `${label} restored`, type: 'success' });
      await load();
    } catch {
      setToast({ message: `Could not restore ${label.toLowerCase()}`, type: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const counts: Record<Tab, number> = {
    images: images.length,
    categories: categories.length,
    events: events.length,
  };

  const TABS: Array<{ key: Tab; label: string }> = [
    { key: 'images', label: 'Images' },
    { key: 'categories', label: 'Categories' },
    { key: 'events', label: 'Events' },
  ];

  return (
    <div className="p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-panel-strong">Recycle bin</h1>
        <p className="mt-1 text-sm text-panel-muted">
          Deleted items are kept, not destroyed. Restore anything removed by mistake.
        </p>
      </div>

      <div role="tablist" aria-label="Deleted item type" className="mb-5 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`min-h-11 rounded-lg px-4 text-sm font-medium transition-colors ${
              tab === t.key
                ? 'bg-emerald-500/15 text-emerald-400'
                : 'bg-panel-raised/50 text-panel-body hover:text-panel-strong'
            }`}
          >
            {t.label} ({counts[t.key]})
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-panel-muted">Loading…</p>
      ) : counts[tab] === 0 ? (
        <p className="rounded-xl border border-panel-line/50 bg-panel-sunken p-6 text-sm text-panel-muted">
          Nothing deleted here.
        </p>
      ) : tab === 'images' ? (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((img) => (
            <li
              key={img.id}
              className="overflow-hidden rounded-xl border border-panel-line/50 bg-panel-sunken"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.image_url}
                alt={img.title}
                loading="lazy"
                className="aspect-video w-full object-cover opacity-60"
              />
              <div className="p-4">
                <p className="truncate text-sm font-medium text-panel-strong">{img.title}</p>
                <p className="text-xs text-panel-muted">{img.category_name || 'Uncategorised'}</p>
                <p className="mt-1 text-[11px] text-panel-faint">Deleted {when(img.deleted_at)}</p>
                <button
                  type="button"
                  disabled={busy === img.id}
                  onClick={() => void restore(`/admin/gallery/images/${img.id}/restore`, img.id, 'Image')}
                  className="mt-3 min-h-11 w-full rounded-lg bg-emerald-600 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
                >
                  {busy === img.id ? 'Restoring…' : 'Restore'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : tab === 'categories' ? (
        <ul className="space-y-3">
          {categories.map((c) => (
            <li
              key={c.id}
              className="flex flex-col gap-3 rounded-xl border border-panel-line/50 bg-panel-sunken p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm font-medium text-panel-strong">{c.name}</p>
                <p className="text-xs text-panel-muted">/{c.slug} · deleted {when(c.deleted_at)}</p>
                <p className="mt-1 text-[11px] text-panel-faint">
                  Restoring also brings back the images that were in it.
                </p>
              </div>
              <button
                type="button"
                disabled={busy === c.id}
                onClick={() => void restore(`/admin/gallery/categories/${c.id}/restore`, c.id, 'Category')}
                className="min-h-11 shrink-0 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
              >
                {busy === c.id ? 'Restoring…' : 'Restore'}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-3">
          {events.map((e) => (
            <li
              key={e.id}
              className="flex flex-col gap-3 rounded-xl border border-panel-line/50 bg-panel-sunken p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm font-medium text-panel-strong">{e.title}</p>
                <p className="text-xs text-panel-muted">
                  {e.event_date ? e.event_date.slice(0, 10) : 'No date'} · deleted {when(e.deleted_at)}
                </p>
              </div>
              <button
                type="button"
                disabled={busy === e.id}
                onClick={() => void restore(`/admin/content/events/${e.id}/restore`, e.id, 'Event')}
                className="min-h-11 shrink-0 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
              >
                {busy === e.id ? 'Restoring…' : 'Restore'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}
