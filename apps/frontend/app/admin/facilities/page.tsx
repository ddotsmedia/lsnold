'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../../lib/api';
import type { PaginatedResponse } from '../../../lib/api';
import { Button, Modal, FormField, Input, Textarea, Toast, ConfirmDialog } from '../../../components/admin/shared';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

interface FacilityImage {
  assignment_id: string;
  media_id: string;
  url: string;
  alt_text: string | null;
  is_primary: boolean;
}

interface Facility {
  id: string;
  name: string;
  description: string;
  detailed_description: string | null;
  icon: string | null;
  location: string | null;
  sort_order: number;
  features: string[];
  amenities: string[];
  images: FacilityImage[];
}

interface FormState {
  name: string;
  description: string;
  detailed_description: string;
  icon: string;
  location: string;
  features: string[];
  amenities: string[];
}

const EMPTY: FormState = {
  name: '', description: '', detailed_description: '', icon: '', location: '',
  features: [], amenities: [],
};

/** A small, relevant set beats a full emoji picker for this many facilities. */
const ICONS = ['🏫', '🌳', '🎨', '🎵', '📚', '💻', '🔬', '🎭', '🍽️', '🧸', '🏊', '⚽', '🧑‍⚕️', '🚌', '🛏️', '🧩'];

type Errors = Partial<Record<'name' | 'description', string>>;

function authHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('lsn_token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Add/remove/reorder-free editor for one bullet list. */
function BulletEditor({
  label, hint, values, onChange,
}: {
  label: string;
  hint: string;
  values: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    if (values.some((v) => v.toLowerCase() === text.toLowerCase())) {
      setDraft('');
      return; // the server rejects duplicates too
    }
    onChange([...values, text]);
    setDraft('');
  };

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-panel-body">{label}</p>
      <p className="mb-2 text-xs text-panel-faint">{hint}</p>

      {values.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {values.map((value, index) => (
            <li key={`${value}-${index}`} className="flex items-center gap-2 rounded-lg bg-panel-sunken px-3 py-2">
              <span className="flex-1 text-sm text-panel-body">{value}</span>
              <button
                type="button"
                onClick={() => onChange(values.filter((_, i) => i !== index))}
                aria-label={`Remove ${value}`}
                className="rounded px-2 text-sm text-red-400 hover:bg-red-500/10"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder="Type and press Enter"
        />
        <Button variant="secondary" onClick={add} className="shrink-0">Add</Button>
      </div>
    </div>
  );
}

export default function FacilitiesPage() {
  const [data, setData] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [modalTab, setModalTab] = useState<'details' | 'images'>('details');
  const [editing, setEditing] = useState<Facility | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Facility | null>(null);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const dragRef = useRef<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const ok = (message: string) => setToast({ message, type: 'success' });
  const fail = (message: string) => setToast({ message, type: 'error' });

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api<PaginatedResponse<Facility>>('/admin/facilities', { params: { limit: 100 } });
      setData(res.data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load facilities');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }
  }, [toast]);

  const openCreate = () => {
    setEditing(null); setForm(EMPTY); setErrors({}); setModalTab('details'); setShowModal(true);
  };

  const openEdit = (f: Facility) => {
    setEditing(f);
    setForm({
      name: f.name,
      description: f.description ?? '',
      detailed_description: f.detailed_description ?? '',
      icon: f.icon ?? '',
      location: f.location ?? '',
      features: [...(f.features ?? [])],
      amenities: [...(f.amenities ?? [])],
    });
    setErrors({}); setModalTab('details'); setShowModal(true);
  };

  const save = async () => {
    const found: Errors = {};
    if (!form.name.trim()) found.name = 'Name is required';
    if (!form.description.trim()) found.description = 'Description is required';
    setErrors(found);
    if (Object.keys(found).length > 0) { fail('Please fix the highlighted fields'); return; }

    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        description: form.description.trim(),
        detailed_description: form.detailed_description.trim() || null,
        icon: form.icon.trim() || null,
        location: form.location.trim() || null,
        features: form.features,
        amenities: form.amenities,
      };
      if (editing) await api(`/admin/facilities/${editing.id}`, { method: 'PUT', body: JSON.stringify(body) });
      else await api('/admin/facilities', { method: 'POST', body: JSON.stringify(body) });
      ok(`Facility ${editing ? 'updated' : 'created'}`);
      setShowModal(false); setEditing(null); setForm(EMPTY);
      await load();
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Failed to save');
    } finally { setSaving(false); }
  };

  const remove = async () => {
    if (!confirmDelete) return;
    const target = confirmDelete;
    setConfirmDelete(null);
    try {
      await api(`/admin/facilities/${target.id}`, { method: 'DELETE' });
      ok(`${target.name} moved to the recycle bin`);
      await load();
    } catch (err) { fail(err instanceof Error ? err.message : 'Failed to delete'); }
  };

  const commitOrder = async (from: number, to: number) => {
    if (from === to) return;
    const next = [...data];
    const [moved] = next.splice(from, 1);
    if (moved) next.splice(to, 0, moved);
    setData(next); // optimistic
    try {
      await api('/admin/facilities/reorder', { method: 'POST', body: JSON.stringify({ ids: next.map((f) => f.id) }) });
      ok('Order saved');
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Failed to save order');
      await load();
    }
  };

  const uploadImages = async (files: FileList | null) => {
    if (!files || files.length === 0 || !editing) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) { fail(`${file.name} is not an image`); continue; }
        const body = new FormData();
        body.append('file', file);
        const res = await fetch(`${API_BASE}/admin/facilities/${editing.id}/images`, {
          method: 'POST', headers: authHeaders(), body,
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error((payload as { error?: string }).error || `Upload failed (${res.status})`);
        }
      }
      ok(`${files.length} image${files.length === 1 ? '' : 's'} uploaded`);
      const refreshed = await api<Facility>(`/admin/facilities/${editing.id}`);
      setEditing(refreshed);
      await load();
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  const removeImage = async (image: FacilityImage) => {
    if (!editing) return;
    try {
      const res = await fetch(`${API_BASE}/admin/facilities/${editing.id}/images/${image.assignment_id}`, {
        method: 'DELETE', headers: authHeaders(),
      });
      if (!res.ok && res.status !== 204) throw new Error(`Failed (${res.status})`);
      ok('Image removed');
      const refreshed = await api<Facility>(`/admin/facilities/${editing.id}`);
      setEditing(refreshed);
      await load();
    } catch (err) { fail(err instanceof Error ? err.message : 'Failed to remove'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-panel-body">
            {loading ? 'Loading…' : `${data.length} facilit${data.length === 1 ? 'y' : 'ies'}`}
          </p>
          <p className="text-xs text-panel-faint">Drag the rows to change the order they appear on the site.</p>
        </div>
        <Button onClick={openCreate}>+ Add Facility</Button>
      </div>

      {loadError ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-8 text-center">
          <p className="text-sm font-medium text-red-300">Could not load facilities</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-red-400/80">{loadError}</p>
          <Button variant="secondary" onClick={() => void load()} className="mt-4">Try again</Button>
        </div>
      ) : loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-panel-raised/40" />)}
        </div>
      ) : data.length === 0 ? (
        <p className="rounded-xl border border-panel-line/50 bg-panel-surface p-10 text-center text-sm text-panel-muted">
          No facilities yet. Use “+ Add Facility” to create the first one.
        </p>
      ) : (
        <ul className="space-y-2">
          {data.map((facility, index) => (
            <li
              key={facility.id}
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
              className={`flex cursor-move items-center gap-4 rounded-xl border bg-panel-surface p-4 transition-all ${
                overIndex === index && dragIndex !== index
                  ? 'border-emerald-500 ring-2 ring-emerald-500/30'
                  : 'border-panel-line/50'
              } ${dragIndex === index ? 'opacity-40' : ''}`}
            >
              <span className="text-panel-faint" aria-hidden="true">⠿</span>

              {facility.images?.[0] ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={facility.images[0].url} alt="" className="h-12 w-16 shrink-0 rounded object-cover" />
              ) : (
                <span className="flex h-12 w-16 shrink-0 items-center justify-center rounded bg-panel-surface text-2xl">
                  {facility.icon || '🏫'}
                </span>
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-panel-strong">{facility.name}</p>
                <p className="truncate text-xs text-panel-muted">{facility.description}</p>
                <p className="mt-0.5 text-xs text-panel-faint">
                  {facility.features?.length ?? 0} features · {facility.amenities?.length ?? 0} amenities ·{' '}
                  {facility.images?.length ?? 0} images
                </p>
              </div>

              <div className="flex shrink-0 gap-1">
                <Button size="sm" variant="secondary" onClick={() => openEdit(facility)}>Edit</Button>
                <Button size="sm" variant="danger" onClick={() => setConfirmDelete(facility)}>Delete</Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={showModal}
        onClose={() => { if (!saving) { setShowModal(false); setEditing(null); } }}
        title={editing ? `Edit ${editing.name}` : 'New Facility'}
        maxWidth="max-w-2xl"
      >
        <div className="max-h-[72vh] space-y-4 overflow-y-auto pr-2">
          {editing && (
            <div className="flex gap-1 border-b border-panel-line" role="tablist" aria-label="Facility sections">
              {([['details', 'Details'], ['images', 'Images']] as const).map(([key, label]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={modalTab === key}
                  onClick={() => setModalTab(key)}
                  className={`-mb-px rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                    modalTab === key
                      ? 'border-emerald-500 text-emerald-400'
                      : 'border-transparent text-panel-muted hover:text-panel-body'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {editing && modalTab === 'images' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-panel-muted">
                  Shown in the facility&rsquo;s gallery on the public page. The first is used as its thumbnail.
                </p>
                <Button onClick={() => imageInputRef.current?.click()} disabled={uploading}>
                  {uploading ? 'Uploading…' : '+ Add images'}
                </Button>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => void uploadImages(e.target.files)}
                />
              </div>

              {(editing.images?.length ?? 0) === 0 ? (
                <p className="py-6 text-center text-sm text-panel-muted">
                  No images yet. The public page shows tinted placeholders until you add some.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {editing.images.map((image) => (
                    <figure key={image.assignment_id} className="group relative overflow-hidden rounded-lg border border-panel-line">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={image.url} alt={image.alt_text ?? ''} className="aspect-4/3 w-full object-cover" />
                      {image.is_primary && (
                        <span className="absolute left-2 top-2 rounded bg-emerald-500/90 px-1.5 py-0.5 text-[10px] font-medium text-white">
                          Primary
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => void removeImage(image)}
                        aria-label="Remove image"
                        className="absolute right-2 top-2 rounded bg-red-500/80 px-2 py-0.5 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                      >
                        ×
                      </button>
                    </figure>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
                <FormField label="Name *" error={errors.name}>
                  <Input
                    value={form.name}
                    onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); setErrors((x) => ({ ...x, name: undefined })); }}
                    placeholder="Math Lab"
                    maxLength={255}
                  />
                </FormField>
                <FormField label="Icon">
                  <div className="flex flex-wrap gap-1">
                    {ICONS.map((icon) => (
                      <button
                        key={icon}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, icon: f.icon === icon ? '' : icon }))}
                        aria-label={`Use ${icon}`}
                        aria-pressed={form.icon === icon}
                        className={`h-8 w-8 rounded text-lg transition-colors ${
                          form.icon === icon ? 'bg-emerald-500/25 ring-1 ring-emerald-500' : 'hover:bg-panel-raised'
                        }`}
                      >
                        {icon}
                      </button>
                    ))}
                  </div>
                </FormField>
              </div>

              <FormField label="Short description *" error={errors.description}>
                <Textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => { setForm((f) => ({ ...f, description: e.target.value })); setErrors((x) => ({ ...x, description: undefined })); }}
                  placeholder="One line shown on the facility card."
                />
              </FormField>

              <FormField label="Full description">
                <Textarea
                  rows={4}
                  value={form.detailed_description}
                  onChange={(e) => setForm((f) => ({ ...f, detailed_description: e.target.value }))}
                  placeholder="The longer text shown when the facility is opened."
                />
              </FormField>

              <FormField label="Location">
                <Input
                  value={form.location}
                  onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                  placeholder="Ground floor, east wing"
                  maxLength={255}
                />
              </FormField>

              <div className="border-t border-panel-line/50 pt-4">
                <BulletEditor
                  label="Features"
                  hint="Shown on the card in the facilities grid."
                  values={form.features}
                  onChange={(features) => setForm((f) => ({ ...f, features }))}
                />
              </div>

              <div className="border-t border-panel-line/50 pt-4">
                <BulletEditor
                  label="Amenities"
                  hint="Shown in the detail panel when the facility is opened."
                  values={form.amenities}
                  onChange={(amenities) => setForm((f) => ({ ...f, amenities }))}
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-panel-line/50 pt-4">
                <Button variant="secondary" onClick={() => setShowModal(false)} disabled={saving}>Cancel</Button>
                <Button onClick={save} disabled={saving}>
                  {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create'}
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={remove}
        title="Delete facility"
        message={`Delete ${confirmDelete?.name ?? 'this facility'}? It moves to the recycle bin and can be restored.`}
        confirmLabel="Delete"
        destructive
      />
      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}
