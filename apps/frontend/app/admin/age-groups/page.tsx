'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../../lib/api';
import { Button, Modal, FormField, Input, Textarea, Toast, ConfirmDialog } from '../../../components/admin/shared';

/**
 * Two different things share the name "age group" here, so they get a tab each.
 *
 * Programmes are the six the public site advertises (Bouncing Bunnies and so
 * on) and are what images attach to. Records are rows in the age_groups table,
 * which the registrations foreign key points at; they hold four unrelated
 * entries and are not what the public page renders.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

interface Programme {
  slug: string;
  name: string;
  range: string;
  gallery_count: number;
  has_hero: boolean;
  has_icon: boolean;
}

interface GroupImage {
  assignment_id: string;
  image_type: string;
  display_order: number;
  media_id: string;
  url: string;
  alt_text: string | null;
  title: string;
  width: number | null;
  height: number | null;
}

interface GroupImages {
  hero: GroupImage | null;
  icon: GroupImage | null;
  banner: GroupImage | null;
  gallery: GroupImage[];
}

interface AgeGroupRecord {
  id: string;
  name: string;
  description: string | null;
  min_age_months: number;
  max_age_months: number;
}

const EMPTY_RECORD = { name: '', description: '', min_age_months: 0, max_age_months: 12 };

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('lsn_token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** XHR, because fetch cannot report upload progress. */
function uploadImage(
  slug: string,
  file: File,
  imageType: string,
  onProgress: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);
    form.append('image_type', imageType);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/admin/age-groups/${slug}/images`);
    const token = localStorage.getItem('lsn_token');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) { resolve(); return; }
      let message = `Upload failed (${xhr.status})`;
      try { message = (JSON.parse(xhr.responseText) as { error?: string }).error ?? message; } catch { /* not JSON */ }
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(form);
  });
}

/* ---------------------------------------------------------------- uploader */

function SlotUploader({
  slug, imageType, label, image, onDone, onError, compact = true,
}: {
  slug: string;
  imageType: string;
  label: string;
  image: GroupImage | null;
  onDone: (message: string) => void;
  onError: (message: string) => void;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  const send = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { onError(`${file.name} is not an image`); return; }
    if (file.size > 10 * 1024 * 1024) { onError(`${file.name} is larger than 10 MB`); return; }
    setBusy(true); setProgress(0);
    try {
      await uploadImage(slug, file, imageType, setProgress);
      onDone(`${label} saved`);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false); setProgress(0);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = async () => {
    if (!image) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/admin/age-groups/${slug}/images/${image.assignment_id}`, {
        method: 'DELETE', headers: authHeaders(),
      });
      if (!res.ok && res.status !== 204) throw new Error(`Failed (${res.status})`);
      onDone(`${label} removed`);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to remove');
    } finally { setBusy(false); }
  };

  return (
    <div>
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-panel-body">{label}</p>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); void send(e.dataTransfer.files); }}
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
        role="button"
        tabIndex={0}
        aria-label={image ? `Replace the ${label}` : `Upload a ${label}`}
        className={`relative flex cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed transition-colors ${
          compact ? 'h-28' : 'h-36'
        } ${dragging ? 'border-emerald-500 bg-emerald-500/10' : 'border-panel-line-2 bg-panel-sunken hover:border-panel-line-2'}`}
      >
        {busy ? (
          <div className="w-full px-4 text-center">
            <p className="mb-1.5 text-xs text-panel-body">{progress > 0 ? `${progress}%` : 'Working…'}</p>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel-raised">
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : image ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.url} alt={image.alt_text ?? ''} className="h-full w-full object-cover" />
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 opacity-0 transition-opacity hover:opacity-100">
              <span className="rounded bg-panel-surface/90 px-2 py-1 text-xs text-panel-strong">Replace</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); void remove(); }}
                className="rounded bg-red-500/25 px-2 py-1 text-xs text-red-200 hover:bg-red-500/40"
              >
                Remove
              </button>
            </div>
          </>
        ) : (
          <p className="px-3 text-center text-xs text-panel-muted">Drop an image or click</p>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => void send(e.target.files)} />
    </div>
  );
}

/* ------------------------------------------------------------------ page */

export default function AgeGroupsPage() {
  const [tab, setTab] = useState<'programmes' | 'records'>('programmes');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const ok = (message: string) => setToast({ message, type: 'success' });
  const fail = (message: string) => setToast({ message, type: 'error' });

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }
  }, [toast]);

  /* --------------------------------------------------------- programmes */

  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [selected, setSelected] = useState<string>('bouncing-bunnies');
  const [images, setImages] = useState<GroupImages | null>(null);
  const [imagesLoading, setImagesLoading] = useState(true);
  const [imagesError, setImagesError] = useState<string | null>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [galleryBusy, setGalleryBusy] = useState(false);

  const dragRef = useRef<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const loadProgrammes = useCallback(async () => {
    try {
      const res = await api<{ data: Programme[] }>('/admin/age-groups');
      setProgrammes(res.data);
    } catch (err) { fail(err instanceof Error ? err.message : 'Failed to load age groups'); }
  }, []);

  const loadImages = useCallback(async (slug: string) => {
    setImagesLoading(true);
    setImagesError(null);
    try {
      const res = await api<{ images: GroupImages }>(`/admin/age-groups/${slug}/images`);
      setImages(res.images);
    } catch (err) {
      setImagesError(err instanceof Error ? err.message : 'Failed to load images');
    } finally { setImagesLoading(false); }
  }, []);

  useEffect(() => { void loadProgrammes(); }, [loadProgrammes]);
  useEffect(() => { if (tab === 'programmes') void loadImages(selected); }, [tab, selected, loadImages]);

  const refresh = async (message: string) => {
    ok(message);
    await Promise.all([loadImages(selected), loadProgrammes()]);
  };

  const addGalleryImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setGalleryBusy(true);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) { fail(`${file.name} is not an image`); continue; }
        await uploadImage(selected, file, 'gallery', () => undefined);
      }
      await refresh(`${files.length} image${files.length === 1 ? '' : 's'} added`);
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setGalleryBusy(false);
      if (galleryInputRef.current) galleryInputRef.current.value = '';
    }
  };

  const removeGalleryImage = async (image: GroupImage) => {
    try {
      const res = await fetch(`${API_BASE}/admin/age-groups/${selected}/images/${image.assignment_id}`, {
        method: 'DELETE', headers: authHeaders(),
      });
      if (!res.ok && res.status !== 204) throw new Error(`Failed (${res.status})`);
      await refresh('Image removed');
    } catch (err) { fail(err instanceof Error ? err.message : 'Failed to remove'); }
  };

  const commitOrder = async (from: number, to: number) => {
    if (!images || from === to) return;
    const next = [...images.gallery];
    const [moved] = next.splice(from, 1);
    if (moved) next.splice(to, 0, moved);
    setImages({ ...images, gallery: next }); // optimistic

    try {
      await api(`/admin/age-groups/${selected}/images/reorder`, {
        method: 'POST',
        body: JSON.stringify({ ids: next.map((i) => i.assignment_id) }),
      });
      ok('Order saved');
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Failed to save order');
      await loadImages(selected);
    }
  };

  /* ------------------------------------------------------------ records */

  const [records, setRecords] = useState<AgeGroupRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [recordsError, setRecordsError] = useState<string | null>(null);
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [recordForm, setRecordForm] = useState(EMPTY_RECORD);
  const [confirmDelete, setConfirmDelete] = useState<AgeGroupRecord | null>(null);

  const loadRecords = useCallback(async () => {
    setRecordsLoading(true);
    setRecordsError(null);
    try {
      setRecords(await api<AgeGroupRecord[]>('/admin/content/age-groups'));
    } catch (err) {
      setRecordsError(err instanceof Error ? err.message : 'Failed to load age groups');
    } finally { setRecordsLoading(false); }
  }, []);

  useEffect(() => { if (tab === 'records') void loadRecords(); }, [tab, loadRecords]);

  const saveRecord = async () => {
    if (!recordForm.name.trim()) { fail('Name is required'); return; }
    if (recordForm.max_age_months <= recordForm.min_age_months) {
      fail('Maximum age must be greater than the minimum'); return;
    }
    try {
      const body = {
        name: recordForm.name.trim(),
        description: recordForm.description.trim() || null,
        min_age_months: Number(recordForm.min_age_months),
        max_age_months: Number(recordForm.max_age_months),
      };
      if (editId) await api(`/admin/content/age-groups/${editId}`, { method: 'PUT', body: JSON.stringify(body) });
      else await api('/admin/content/age-groups', { method: 'POST', body: JSON.stringify(body) });
      ok(`Age group ${editId ? 'updated' : 'created'}`);
      setShowRecordModal(false); setEditId(null); setRecordForm(EMPTY_RECORD);
      await loadRecords();
    } catch (err) { fail(err instanceof Error ? err.message : 'Failed to save'); }
  };

  const deleteRecord = async () => {
    if (!confirmDelete) return;
    const target = confirmDelete;
    setConfirmDelete(null);
    try {
      await api(`/admin/content/age-groups/${target.id}`, { method: 'DELETE' });
      ok(`${target.name} deleted`);
      await loadRecords();
    } catch (err) { fail(err instanceof Error ? err.message : 'Failed to delete'); }
  };

  const current = programmes.find((p) => p.slug === selected);

  /* ------------------------------------------------------------- render */

  return (
    <div className="space-y-6">
      <div className="flex gap-1 border-b border-panel-line" role="tablist" aria-label="Age group sections">
        {([['programmes', 'Programmes & Images'], ['records', 'Age Group Records']] as const).map(([key, label]) => {
          const active = tab === key;
          return (
            <button
              key={key}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(key)}
              className={`-mb-px rounded-t-lg border-b-2 px-5 py-3 text-sm font-medium transition-colors ${
                active ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-panel-muted hover:text-panel-body'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {tab === 'programmes' ? (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            {programmes.map((p) => (
              <button
                key={p.slug}
                onClick={() => setSelected(p.slug)}
                className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  selected === p.slug
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400'
                    : 'border-panel-line bg-panel-surface/40 text-panel-body hover:text-panel-strong'
                }`}
              >
                <span className="block font-medium">{p.name}</span>
                <span className="block text-xs opacity-70">
                  {p.range} · {p.gallery_count} image{p.gallery_count === 1 ? '' : 's'}
                </span>
              </button>
            ))}
          </div>

          {imagesError ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
              <p className="text-sm text-red-300">Could not load images</p>
              <p className="mt-1 text-xs text-red-400/80">{imagesError}</p>
              <Button variant="secondary" onClick={() => void loadImages(selected)} className="mt-3">Try again</Button>
            </div>
          ) : imagesLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[0, 1, 2].map((i) => <div key={i} className="h-32 animate-pulse rounded-lg bg-panel-raised/40" />)}
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-panel-line/50 bg-panel-surface p-6">
                <h3 className="mb-4 text-sm font-medium text-panel-body">{current?.name ?? 'Programme'} — key images</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <SlotUploader slug={selected} imageType="hero" label="Hero" image={images?.hero ?? null}
                    onDone={(m) => void refresh(m)} onError={fail} />
                  <SlotUploader slug={selected} imageType="icon" label="Icon" image={images?.icon ?? null}
                    onDone={(m) => void refresh(m)} onError={fail} />
                  <SlotUploader slug={selected} imageType="banner" label="Banner" image={images?.banner ?? null}
                    onDone={(m) => void refresh(m)} onError={fail} />
                </div>
              </div>

              <div className="rounded-xl border border-panel-line/50 bg-panel-surface p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-medium text-panel-body">Gallery</h3>
                    <p className="text-xs text-panel-muted">Shown on the public page. Drag to reorder.</p>
                  </div>
                  <Button onClick={() => galleryInputRef.current?.click()} disabled={galleryBusy}>
                    {galleryBusy ? 'Uploading…' : '+ Add images'}
                  </Button>
                  <input
                    ref={galleryInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => void addGalleryImages(e.target.files)}
                  />
                </div>

                {(images?.gallery.length ?? 0) === 0 ? (
                  <p className="text-sm text-panel-muted">No gallery images yet.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {images!.gallery.map((image, index) => (
                      <figure
                        key={image.assignment_id}
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
                        className={`group relative cursor-move overflow-hidden rounded-lg border bg-panel-sunken transition-all ${
                          overIndex === index && dragIndex !== index
                            ? 'border-emerald-500 ring-2 ring-emerald-500/40'
                            : 'border-panel-line'
                        } ${dragIndex === index ? 'opacity-40' : ''}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={image.url} alt={image.alt_text ?? ''} className="aspect-4/3 w-full object-cover" />
                        <button
                          type="button"
                          onClick={() => void removeGalleryImage(image)}
                          aria-label={`Remove ${image.title}`}
                          className="absolute right-2 top-2 rounded bg-red-500/80 px-2 py-0.5 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                        >
                          ×
                        </button>
                        <figcaption className="truncate px-2 py-1.5 text-xs text-panel-muted">
                          {image.alt_text || image.title}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="max-w-2xl text-xs text-panel-muted">
              Rows in the age_groups table, referenced by registrations. These are separate from the
              programmes above and are not what the public page shows.
            </p>
            <Button onClick={() => { setEditId(null); setRecordForm(EMPTY_RECORD); setShowRecordModal(true); }}>
              + New Record
            </Button>
          </div>

          {recordsError ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
              <p className="text-sm text-red-300">Could not load age groups</p>
              <p className="mt-1 text-xs text-red-400/80">{recordsError}</p>
              <Button variant="secondary" onClick={() => void loadRecords()} className="mt-3">Try again</Button>
            </div>
          ) : recordsLoading ? (
            <div className="h-32 animate-pulse rounded-xl bg-panel-raised/40" />
          ) : (
            <div className="overflow-hidden rounded-xl border border-panel-line/50 bg-panel-surface">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-panel-line/50 text-left text-xs uppercase tracking-wider text-panel-muted">
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Age range</th>
                    <th className="w-40 px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {records.length === 0 ? (
                    <tr><td colSpan={3} className="px-4 py-8 text-center text-panel-muted">No age group records.</td></tr>
                  ) : records.map((r) => (
                    <tr key={r.id} className="border-b border-panel-line/30 hover:bg-panel-surface/40">
                      <td className="px-4 py-3 font-medium text-panel-strong">{r.name}</td>
                      <td className="px-4 py-3 text-xs text-panel-body">
                        {r.min_age_months}–{r.max_age_months} months
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <Button size="sm" variant="secondary" onClick={() => {
                            setEditId(r.id);
                            setRecordForm({
                              name: r.name,
                              description: r.description ?? '',
                              min_age_months: r.min_age_months,
                              max_age_months: r.max_age_months,
                            });
                            setShowRecordModal(true);
                          }}>Edit</Button>
                          <Button size="sm" variant="danger" onClick={() => setConfirmDelete(r)}>Delete</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <Modal
        open={showRecordModal}
        onClose={() => setShowRecordModal(false)}
        title={editId ? 'Edit Age Group' : 'New Age Group'}
        maxWidth="max-w-lg"
      >
        <div className="space-y-4">
          <FormField label="Name *">
            <Input value={recordForm.name} onChange={(e) => setRecordForm((f) => ({ ...f, name: e.target.value }))} />
          </FormField>
          <FormField label="Description">
            <Textarea rows={3} value={recordForm.description}
              onChange={(e) => setRecordForm((f) => ({ ...f, description: e.target.value }))} />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Min age (months)">
              <Input type="number" min={0} value={recordForm.min_age_months}
                onChange={(e) => setRecordForm((f) => ({ ...f, min_age_months: Number(e.target.value) }))} />
            </FormField>
            <FormField label="Max age (months)">
              <Input type="number" min={1} value={recordForm.max_age_months}
                onChange={(e) => setRecordForm((f) => ({ ...f, max_age_months: Number(e.target.value) }))} />
            </FormField>
          </div>
          <div className="flex justify-end gap-2 border-t border-panel-line/50 pt-4">
            <Button variant="secondary" onClick={() => setShowRecordModal(false)}>Cancel</Button>
            <Button onClick={saveRecord}>{editId ? 'Save Changes' : 'Create'}</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={deleteRecord}
        title="Delete age group"
        message={`Delete ${confirmDelete?.name ?? 'this age group'}? Registrations referencing it would be affected.`}
        confirmLabel="Delete"
        destructive
      />
      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}
