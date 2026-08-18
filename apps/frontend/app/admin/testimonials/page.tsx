'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../../lib/api';
import {
  Button, Modal, FormField, Input, Textarea, Select, Toast, ConfirmDialog,
} from '../../../components/admin/shared';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

interface Testimonial {
  id: string;
  author_name: string;
  author_title: string | null;
  author_image_url: string | null;
  quote: string;
  rating: number | null;
  is_published: boolean;
  sort_order: number;
  page_slug: string | null;
  created_by_name: string | null;
}

interface FormState {
  author_name: string;
  author_title: string;
  quote: string;
  /** '' means no rating, which is how the four home page reviews are stored. */
  rating: string;
  is_published: boolean;
  page_slug: string;
}

const EMPTY: FormState = {
  author_name: '', author_title: '', quote: '', rating: '5', is_published: true, page_slug: '',
};

/** Matches the slugs the pages request. */
const PAGE_OPTIONS = [
  { value: '', label: 'All pages' },
  { value: 'home', label: 'Home' },
  { value: 'about', label: 'About (Nursery)' },
  { value: 'facilities', label: 'Facilities' },
  { value: 'age-groups', label: 'Age Groups' },
  { value: 'contact', label: 'Contact' },
  { value: 'booking', label: 'Book a Tour' },
];

const RATING_OPTIONS = [
  { value: '', label: 'No rating' },
  { value: '5', label: '★★★★★  5' },
  { value: '4', label: '★★★★☆  4' },
  { value: '3', label: '★★★☆☆  3' },
  { value: '2', label: '★★☆☆☆  2' },
  { value: '1', label: '★☆☆☆☆  1' },
];

function Stars({ rating }: { rating: number | null }) {
  if (!rating) return <span className="text-xs text-panel-faint">No rating</span>;
  return (
    <span className="text-amber-400" aria-label={`${rating} out of 5 stars`}>
      {'★'.repeat(rating)}
      <span className="text-panel-faint">{'★'.repeat(5 - rating)}</span>
    </span>
  );
}

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('lsn_token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function TestimonialsAdmin() {
  const [items, setItems] = useState<Testimonial[]>([]);
  const [deleted, setDeleted] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Testimonial | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [saving, setSaving] = useState(false);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Testimonial | null>(null);

  const dragRef = useRef<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const ok = (message: string) => setToast({ message, type: 'success' });
  const fail = (message: string) => setToast({ message, type: 'error' });

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [live, gone] = await Promise.all([
        api<{ data: Testimonial[] }>('/admin/testimonials'),
        api<{ data: Testimonial[] }>('/admin/testimonials', { params: { deleted: 'true' } }),
      ]);
      setItems(live.data);
      setDeleted(gone.data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load testimonials');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }
  }, [toast]);

  const clearPhoto = () => {
    setPhotoPreview((old) => { if (old?.startsWith('blob:')) URL.revokeObjectURL(old); return null; });
    setPhotoFile(null);
  };

  const openCreate = () => {
    setEditing(null); setForm(EMPTY); setErrors({}); clearPhoto(); setShowModal(true);
  };

  const openEdit = (t: Testimonial) => {
    setEditing(t);
    setForm({
      author_name: t.author_name,
      author_title: t.author_title ?? '',
      quote: t.quote,
      rating: t.rating ? String(t.rating) : '',
      is_published: t.is_published,
      page_slug: t.page_slug ?? '',
    });
    setErrors({});
    setPhotoFile(null);
    setPhotoPreview(t.author_image_url);
    setShowModal(true);
  };

  const pickPhoto = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { fail('Please choose an image file'); return; }
    if (file.size > 5 * 1024 * 1024) { fail('Photo must be 5 MB or smaller'); return; }
    setPhotoFile(file);
    setPhotoPreview((old) => {
      if (old?.startsWith('blob:')) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });
  };

  const uploadPhoto = async (id: string, file: File) => {
    const body = new FormData();
    body.append('image', file);
    const res = await fetch(`${API_BASE}/admin/testimonials/${id}/image`, {
      method: 'POST', headers: authHeaders(), body,
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error || `Upload failed (${res.status})`);
    }
  };

  const removePhoto = async () => {
    if (!editing) { clearPhoto(); return; }
    setPhotoBusy(true);
    try {
      const res = await fetch(`${API_BASE}/admin/testimonials/${editing.id}/image`, {
        method: 'DELETE', headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      clearPhoto();
      ok('Photo removed');
      await load();
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Failed to remove photo');
    } finally { setPhotoBusy(false); }
  };

  const save = async () => {
    const found: Partial<Record<keyof FormState, string>> = {};
    if (!form.author_name.trim()) found.author_name = 'Author name is required';
    if (!form.quote.trim()) found.quote = 'A quote is required';
    setErrors(found);
    if (Object.keys(found).length > 0) { fail('Please fix the highlighted fields'); return; }

    setSaving(true);
    try {
      const body = {
        author_name: form.author_name.trim(),
        author_title: form.author_title.trim() || null,
        quote: form.quote.trim(),
        rating: form.rating === '' ? null : Number(form.rating),
        is_published: form.is_published,
        page_slug: form.page_slug || null,
      };

      let id = editing?.id;
      if (editing) {
        await api(`/admin/testimonials/${editing.id}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        const created = await api<Testimonial>('/admin/testimonials', { method: 'POST', body: JSON.stringify(body) });
        id = created?.id;
      }

      // The photo is attached after the row exists, since the endpoint keys it
      // to the id. A failure here does not discard what was just saved.
      if (photoFile && id) {
        try {
          await uploadPhoto(id, photoFile);
        } catch (err) {
          fail(`Saved, but the photo failed: ${err instanceof Error ? err.message : 'upload error'}`);
          setShowModal(false); setEditing(null); clearPhoto();
          await load();
          setSaving(false);
          return;
        }
      }

      ok(`Testimonial ${editing ? 'updated' : 'added'}`);
      setShowModal(false); setEditing(null); setForm(EMPTY); clearPhoto();
      await load();
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Failed to save');
    } finally { setSaving(false); }
  };

  const togglePublished = async (t: Testimonial) => {
    try {
      await api(`/admin/testimonials/${t.id}`, {
        method: 'PUT', body: JSON.stringify({ is_published: !t.is_published }),
      });
      ok(t.is_published ? 'Unpublished' : 'Published');
      await load();
    } catch (err) { fail(err instanceof Error ? err.message : 'Failed to update'); }
  };

  const remove = async () => {
    if (!confirmDelete) return;
    const target = confirmDelete;
    setConfirmDelete(null);
    try {
      await api(`/admin/testimonials/${target.id}`, { method: 'DELETE' });
      ok(`${target.author_name} deleted — it can be restored below`);
      await load();
    } catch (err) { fail(err instanceof Error ? err.message : 'Failed to delete'); }
  };

  const restore = async (t: Testimonial) => {
    try {
      await api(`/admin/testimonials/${t.id}/restore`, { method: 'POST' });
      ok('Testimonial restored');
      await load();
    } catch (err) { fail(err instanceof Error ? err.message : 'Failed to restore'); }
  };

  const commitOrder = async (from: number, to: number) => {
    if (from === to) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    if (moved) next.splice(to, 0, moved);
    setItems(next); // optimistic
    try {
      await api('/admin/testimonials/reorder', {
        method: 'POST', body: JSON.stringify({ ids: next.map((t) => t.id) }),
      });
      ok('Order saved');
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Failed to save order');
      await load();
    }
  };

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-panel-body">
            {loading ? 'Loading…' : `${items.length} testimonial${items.length === 1 ? '' : 's'}`}
          </p>
          <p className="text-xs text-panel-faint">
            Drag to change the order they appear in. Only published ones show on the site.
          </p>
        </div>
        <Button onClick={openCreate}>+ Add Testimonial</Button>
      </div>

      {loadError ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-8 text-center">
          <p className="text-sm font-medium text-red-300">Could not load testimonials</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-red-400/80">{loadError}</p>
          <Button variant="secondary" onClick={() => void load()} className="mt-4">Try again</Button>
        </div>
      ) : loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-panel-raised/40" />)}
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-panel-line/50 bg-panel-surface p-10 text-center text-sm text-panel-muted">
          No testimonials yet. Use “+ Add Testimonial” to add the first one.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((t, index) => (
            <li
              key={t.id}
              draggable
              onDragStart={() => { dragRef.current = index; setDragIndex(index); }}
              onDragOver={(e) => { e.preventDefault(); setOverIndex(index); }}
              onDragEnd={() => { dragRef.current = null; setDragIndex(null); setOverIndex(null); }}
              onDrop={(e) => {
                e.preventDefault();
                const from = dragRef.current;
                if (from !== null) void commitOrder(from, index);
                dragRef.current = null; setDragIndex(null); setOverIndex(null);
              }}
              className={`flex cursor-move gap-4 rounded-xl border bg-panel-surface p-4 transition-all ${
                overIndex === index && dragIndex !== index
                  ? 'border-emerald-500 ring-2 ring-emerald-500/30'
                  : 'border-panel-line/50'
              } ${dragIndex === index ? 'opacity-40' : ''}`}
            >
              <span className="pt-1 text-panel-faint" aria-hidden="true">⠿</span>

              {t.author_image_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={t.author_image_url} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
              ) : (
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-panel-raised text-sm text-panel-muted">
                  {t.author_name.slice(0, 1).toUpperCase()}
                </span>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-panel-strong">{t.author_name}</span>
                  {t.author_title && <span className="text-xs text-panel-muted">{t.author_title}</span>}
                  <Stars rating={t.rating} />
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] ${
                    t.is_published
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                      : 'border-zinc-500/30 bg-zinc-500/10 text-panel-body'
                  }`}>
                    {t.is_published ? 'Published' : 'Draft'}
                  </span>
                  {t.page_slug && (
                    <code className="rounded bg-panel-raised px-1.5 py-0.5 text-[10px] text-panel-muted">{t.page_slug}</code>
                  )}
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-panel-muted">{t.quote}</p>
              </div>

              <div className="flex shrink-0 flex-col gap-1">
                <Button size="sm" variant="secondary" onClick={() => openEdit(t)}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => void togglePublished(t)}>
                  {t.is_published ? 'Unpublish' : 'Publish'}
                </Button>
                <Button size="sm" variant="danger" onClick={() => setConfirmDelete(t)}>Delete</Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {deleted.length > 0 && (
        <div className="rounded-xl border border-panel-line/50 bg-panel-sunken p-5">
          <button onClick={() => setShowDeleted((v) => !v)} className="text-sm text-panel-body hover:text-panel-strong">
            {showDeleted ? '▾' : '▸'} Deleted testimonials ({deleted.length})
          </button>
          {showDeleted && (
            <ul className="mt-3 space-y-2">
              {deleted.map((t) => (
                <li key={t.id} className="flex items-center gap-3 rounded-lg bg-panel-surface px-3 py-2">
                  <span className="flex-1 truncate text-sm text-panel-body">
                    {t.author_name} — {t.quote.slice(0, 60)}…
                  </span>
                  <Button size="sm" variant="secondary" onClick={() => void restore(t)}>Restore</Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Modal
        open={showModal}
        onClose={() => { if (!saving) { setShowModal(false); setEditing(null); } }}
        title={editing ? `Edit ${editing.author_name}` : 'Add testimonial'}
        maxWidth="max-w-xl"
      >
        <div className="max-h-[72vh] space-y-4 overflow-y-auto pr-2">
          <div className="flex items-start gap-4">
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-panel-body">Photo</p>
              {photoPreview ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoPreview} alt="" className="h-24 w-24 rounded-full border border-panel-line object-cover" />
                  <button
                    type="button"
                    onClick={() => void removePhoto()}
                    disabled={photoBusy}
                    aria-label="Remove photo"
                    className="absolute -right-1 -top-1 rounded-full bg-red-500/90 px-2 text-xs text-white hover:bg-red-500 disabled:opacity-50"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-full border border-dashed border-panel-line-2 text-xs text-panel-faint">
                  Optional
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => pickPhoto(e.target.files?.[0])}
                className="mt-2 w-24 text-[10px] text-panel-body file:mr-1 file:rounded file:border-0 file:bg-panel-raised file:px-1.5 file:py-0.5 file:text-[10px] file:text-panel-strong"
              />
            </div>

            <div className="flex-1 space-y-4">
              <FormField label="Author name *" error={errors.author_name}>
                <Input
                  value={form.author_name}
                  onChange={(e) => setField('author_name', e.target.value)}
                  placeholder="Fatima Al-Mansouri"
                  maxLength={255}
                />
              </FormField>
              <FormField label="Role or location">
                <Input
                  value={form.author_title}
                  onChange={(e) => setField('author_title', e.target.value)}
                  placeholder="Parent · Abu Dhabi"
                  maxLength={255}
                />
              </FormField>
            </div>
          </div>

          <FormField label="Quote *" error={errors.quote}>
            <Textarea
              rows={5}
              value={form.quote}
              onChange={(e) => setField('quote', e.target.value)}
              placeholder="What the family said."
            />
          </FormField>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField label="Rating">
              <Select
                value={form.rating}
                onChange={(e) => setField('rating', e.target.value)}
                options={RATING_OPTIONS}
              />
            </FormField>
            <FormField label="Show on">
              <Select
                value={form.page_slug}
                onChange={(e) => setField('page_slug', e.target.value)}
                options={PAGE_OPTIONS}
              />
            </FormField>
            <FormField label="Status">
              <Select
                value={form.is_published ? 'published' : 'draft'}
                onChange={(e) => setField('is_published', e.target.value === 'published')}
                options={[
                  { value: 'published', label: 'Published' },
                  { value: 'draft', label: 'Draft' },
                ]}
              />
            </FormField>
          </div>

          <div className="flex justify-end gap-2 border-t border-panel-line/50 pt-4">
            <Button variant="secondary" onClick={() => setShowModal(false)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => void remove()}
        title="Delete testimonial"
        message={`Delete the review from ${confirmDelete?.author_name ?? 'this author'}? It can be restored afterwards.`}
        confirmLabel="Delete"
        destructive
      />
      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}
