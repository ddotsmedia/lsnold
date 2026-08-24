'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Button, ConfirmDialog, FormField, Input, Modal, Select, Textarea, Toast } from './shared';

interface YoutubeVideo {
  id: string;
  title: string;
  description: string | null;
  youtube_url: string;
  youtube_id: string;
  thumbnail_url: string | null;
  display_order: number;
  page_slug: string | null;
  uploaded_by_name?: string | null;
  created_at: string;
}

interface FormState {
  title: string;
  description: string;
  youtube_url: string;
  display_order: string;
  page_slug: string;
}

const EMPTY: FormState = {
  title: '', description: '', youtube_url: '', display_order: '0', page_slug: '',
};

/**
 * Pages that render a video. The value is the route name, matching what
 * usePageVideo asks for — 'nursery' not 'about'. An empty value leaves the
 * video in the gallery only.
 */
const PAGE_OPTIONS = [
  { value: '', label: 'Gallery only (not on a page)' },
  { value: 'home', label: 'Home' },
  { value: 'nursery', label: 'Nursery / About' },
  { value: 'facilities', label: 'Facilities' },
  { value: 'age-groups', label: 'Age Groups' },
];

/** Mirrors the server-side parser so bad links are caught before a round trip. */
function previewId(url: string): string | null {
  const raw = url.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
  try {
    const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '');
    if (host === 'youtu.be') {
      const seg = u.pathname.split('/').filter(Boolean)[0];
      return seg && /^[A-Za-z0-9_-]{11}$/.test(seg) ? seg : null;
    }
    if (host !== 'youtube.com' && host !== 'youtube-nocookie.com' && !host.endsWith('.youtube.com')) {
      return null;
    }
    const v = u.searchParams.get('v');
    if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
    const parts = u.pathname.split('/').filter(Boolean);
    const i = parts.findIndex((p) => ['embed', 'shorts', 'live', 'v'].includes(p));
    const candidate = i !== -1 ? parts[i + 1] : undefined;
    return candidate && /^[A-Za-z0-9_-]{11}$/.test(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

export function YoutubeManager() {
  const [videos, setVideos] = useState<YoutubeVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<YoutubeVideo | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<YoutubeVideo | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setVideos(await api<YoutubeVideo[]>('/admin/youtube-videos'));
    } catch {
      setToast({ message: 'Failed to load videos', type: 'error' });
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

  const openNew = (): void => { setEditing(null); setForm(EMPTY); setError(null); setOpen(true); };

  const openEdit = (v: YoutubeVideo): void => {
    setEditing(v);
    setForm({
      title: v.title,
      description: v.description ?? '',
      youtube_url: v.youtube_url,
      display_order: String(v.display_order),
      page_slug: v.page_slug ?? '',
    });
    setError(null);
    setOpen(true);
  };

  const save = async (): Promise<void> => {
    if (!form.title.trim()) { setError('Give the video a title.'); return; }
    if (!previewId(form.youtube_url)) {
      setError('That does not look like a YouTube link. Try https://youtu.be/… or a watch?v=… URL.');
      return;
    }

    setSaving(true);
    setError(null);
    const body = JSON.stringify({
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      youtube_url: form.youtube_url.trim(),
      display_order: Number(form.display_order) || 0,
      // Always sent, including as null: the server distinguishes "not supplied"
      // from "set to null", and null is how a video is unassigned.
      page_slug: form.page_slug || null,
    });

    try {
      if (editing) {
        await api(`/admin/youtube-videos/${editing.id}`, { method: 'PUT', body });
      } else {
        await api('/admin/youtube-videos', { method: 'POST', body });
      }
      setOpen(false);
      await load();
      setToast({ message: editing ? 'Video updated' : 'Video added', type: 'success' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the video');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (v: YoutubeVideo): Promise<void> => {
    try {
      await api(`/admin/youtube-videos/${v.id}`, { method: 'DELETE' });
      setConfirm(null);
      await load();
      setToast({ message: 'Video removed', type: 'success' });
    } catch {
      setToast({ message: 'Failed to remove video', type: 'error' });
    }
  };

  const pending = previewId(form.youtube_url);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-panel-muted">
          Videos shown on the public gallery page. Nothing is uploaded — YouTube hosts the file.
        </p>
        <Button onClick={openNew}>Add video</Button>
      </div>

      {loading ? (
        <p className="text-sm text-panel-muted">Loading…</p>
      ) : videos.length === 0 ? (
        <p className="rounded-xl border border-panel-line/50 bg-panel-sunken p-6 text-sm text-panel-muted">
          No videos yet.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {videos.map((v) => (
            <li key={v.id} className="overflow-hidden rounded-xl border border-panel-line/50 bg-panel-sunken">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={v.thumbnail_url || `https://img.youtube.com/vi/${v.youtube_id}/hqdefault.jpg`}
                alt=""
                loading="lazy"
                className="aspect-video w-full object-cover"
              />
              <div className="p-4">
                <p className="truncate text-sm font-medium text-panel-strong">{v.title}</p>
                <p className="mt-0.5 truncate text-xs text-panel-muted">{v.youtube_id}</p>
                <p className="mt-1 text-xs">
                  {v.page_slug ? (
                    <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-400">
                      on /{v.page_slug === 'home' ? '' : v.page_slug}
                    </span>
                  ) : (
                    <span className="text-panel-faint">gallery only</span>
                  )}
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(v)}
                    className="min-h-11 flex-1 rounded-lg bg-panel-raised text-sm text-panel-strong hover:bg-panel-raised-2"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirm(v)}
                    className="min-h-11 flex-1 rounded-lg bg-red-500/10 text-sm text-red-400 hover:bg-red-500/20"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit video' : 'Add YouTube video'}>
        <div className="space-y-4">
          <FormField label="Title">
            <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </FormField>

          <FormField label="YouTube link">
            <Input
              value={form.youtube_url}
              onChange={(e) => setForm((f) => ({ ...f, youtube_url: e.target.value }))}
              placeholder="https://www.youtube.com/watch?v=…"
            />
          </FormField>

          {pending && (
            <div className="flex items-center gap-3 rounded-lg border border-panel-line bg-panel-surface/60 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://img.youtube.com/vi/${pending}/default.jpg`}
                alt=""
                className="h-12 w-20 rounded object-cover"
              />
              <span className="text-xs text-panel-body">
                Video id <span className="font-mono text-panel-body">{pending}</span>
              </span>
            </div>
          )}

          <FormField label="Description">
            <Textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </FormField>

          <FormField label="Display order">
            <Input
              type="number"
              min={0}
              value={form.display_order}
              onChange={(e) => setForm((f) => ({ ...f, display_order: e.target.value }))}
            />
          </FormField>

          <FormField label="Show on page">
            <Select
              options={PAGE_OPTIONS}
              value={form.page_slug}
              onChange={(e) => setForm((f) => ({ ...f, page_slug: e.target.value }))}
            />
          </FormField>
          <p className="-mt-2 text-xs text-panel-muted">
            A page shows the lowest display order assigned to it. Every video appears in the
            gallery regardless.
          </p>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => void save()} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirm !== null}
        title="Remove video"
        message={`Remove "${confirm?.title ?? ''}" from the gallery?`}
        confirmLabel="Remove"
        destructive
        onConfirm={() => { if (confirm) void remove(confirm); }}
        onClose={() => setConfirm(null)}
      />

      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}

export default YoutubeManager;
