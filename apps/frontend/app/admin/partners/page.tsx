'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../../lib/api';
import type { PaginatedResponse } from '../../../lib/api';
import {
  SearchBar, Button, Modal, FormField, Input, Textarea, Select, Toast, ConfirmDialog,
} from '../../../components/admin/shared';
import { PartnerUpload } from '../../../components/admin/PartnerUpload';

interface Partner {
  id: string;
  name: string;
  logo_url: string | null;
  website_url: string | null;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

interface FormState {
  name: string;
  website_url: string;
  description: string;
  is_active: boolean;
}

const EMPTY: FormState = { name: '', website_url: '', description: '', is_active: true };

type Errors = Partial<Record<keyof FormState | 'logo', string>>;

const SORTS = [
  { value: 'custom', label: 'Custom order' },
  { value: 'recent', label: 'Recently added' },
  { value: 'name', label: 'Name A-Z' },
];

const MAX_LOGO_BYTES = 5 * 1024 * 1024;

/** Mirrors the server's rules so a mistake costs no round trip. */
function validate(form: FormState): Errors {
  const errors: Errors = {};
  if (!form.name.trim()) errors.name = 'Name is required';
  else if (form.name.trim().length > 255) errors.name = 'Name must be 255 characters or fewer';

  if (form.website_url.trim()) {
    try {
      const url = new URL(form.website_url.trim());
      if (!/^https?:$/.test(url.protocol)) errors.website_url = 'Website must start with http:// or https://';
    } catch {
      errors.website_url = 'Must be a valid URL, e.g. https://partner.com';
    }
  }
  return errors;
}

export default function PartnersPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('custom');

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Partner | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Partner | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  // Drag source lives in a ref: a drag can finish before React re-renders, in
  // which case a state copy would still be null and the drop would do nothing.
  const dragRef = useRef<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<PaginatedResponse<Partner>>('/admin/partners', {
        params: { limit: 100, search, sort },
      });
      setPartners(res.data);
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Failed to load partners', type: 'error' });
    } finally { setLoading(false); }
  }, [search, sort]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }
  }, [toast]);

  const openCreate = () => {
    setEditing(null); setForm(EMPTY); setLogoFile(null); setErrors({}); setShowModal(true);
  };

  const openEdit = (p: Partner) => {
    setEditing(p);
    setForm({
      name: p.name,
      website_url: p.website_url ?? '',
      description: p.description ?? '',
      is_active: p.is_active !== false,
    });
    setLogoFile(null); setErrors({}); setShowModal(true);
  };

  const closeModal = () => { if (!saving) { setShowModal(false); setEditing(null); setErrors({}); } };

  /**
   * XHR rather than fetch: only XHR reports upload progress, and a logo upload
   * deserves a progress bar.
   */
  const submit = () => {
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setToast({ message: 'Please fix the highlighted fields', type: 'error' });
      return;
    }

    const body = new FormData();
    body.append('name', form.name.trim());
    body.append('website_url', form.website_url.trim());
    body.append('description', form.description.trim());
    body.append('is_active', String(form.is_active));
    if (logoFile) body.append('logo', logoFile);

    const base = process.env.NEXT_PUBLIC_API_URL || '';
    const url = editing ? `${base}/admin/partners/${editing.id}` : `${base}/admin/partners`;

    setSaving(true);
    setProgress(0);

    const xhr = new XMLHttpRequest();
    xhr.open(editing ? 'PUT' : 'POST', url);
    const token = localStorage.getItem('lsn_token');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      setSaving(false);
      if (xhr.status >= 200 && xhr.status < 300) {
        setToast({ message: editing ? 'Partner updated' : 'Partner added', type: 'success' });
        setShowModal(false); setEditing(null); setForm(EMPTY); setLogoFile(null);
        void load();
      } else {
        let message = `Save failed (${xhr.status})`;
        try { message = (JSON.parse(xhr.responseText) as { error?: string }).error ?? message; } catch { /* not JSON */ }
        setToast({ message, type: 'error' });
      }
    };
    xhr.onerror = () => { setSaving(false); setToast({ message: 'Network error', type: 'error' }); };
    xhr.send(body);
  };

  const remove = async () => {
    if (!confirmDelete) return;
    const target = confirmDelete;
    setConfirmDelete(null);
    try {
      await api(`/admin/partners/${target.id}`, { method: 'DELETE' });
      setToast({ message: `${target.name} deleted`, type: 'success' });
      await load();
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Failed to delete', type: 'error' });
    }
  };

  const removeSelected = async () => {
    try {
      for (const id of selected) await api(`/admin/partners/${id}`, { method: 'DELETE' });
      setToast({ message: `${selected.length} deleted`, type: 'success' });
      setSelected([]);
      await load();
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Failed to delete', type: 'error' });
    }
  };

  const commitOrder = async (from: number, to: number) => {
    if (from === to) return;
    const next = [...partners];
    const [moved] = next.splice(from, 1);
    if (moved) next.splice(to, 0, moved);
    setPartners(next); // optimistic

    try {
      await api('/admin/partners/reorder', {
        method: 'POST', body: JSON.stringify({ ids: next.map((p) => p.id) }),
      });
      setToast({ message: 'Order saved', type: 'success' });
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : 'Failed to save order', type: 'error' });
      await load();
    }
  };

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  };

  const canDrag = sort === 'custom' && !search;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row">
          <div className="w-full sm:max-w-xs">
            <SearchBar value={search} onChange={setSearch} placeholder="Search partners..." />
          </div>
          <Select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            options={SORTS}
            className="sm:w-44"
          />
        </div>
        <div className="flex gap-2">
          {selected.length > 0 && (
            <Button variant="danger" onClick={() => void removeSelected()}>
              Delete {selected.length}
            </Button>
          )}
          <Button onClick={openCreate} className="shrink-0">+ Add Partner</Button>
        </div>
      </div>

      {!canDrag && partners.length > 1 && (
        <p className="text-xs text-panel-muted">
          Switch to “Custom order” with no search to drag partners into position.
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-panel-line/50 bg-panel-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-panel-line/50 text-left text-xs uppercase tracking-wider text-panel-muted">
              <th className="w-10 px-4 py-3" />
              <th className="w-20 px-4 py-3">Logo</th>
              <th className="px-4 py-3">Name</th>
              <th className="hidden px-4 py-3 md:table-cell">Website</th>
              <th className="px-4 py-3">Active</th>
              <th className="w-40 px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 4 }, (_, i) => (
                <tr key={i} className="border-b border-panel-line/30">
                  <td colSpan={6} className="px-4 py-4">
                    <div className="h-10 animate-pulse rounded bg-panel-raised/50" />
                  </td>
                </tr>
              ))
            ) : partners.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-panel-muted">
                  {search ? 'No partners match that search.' : 'No partners yet. Use “+ Add Partner” to add the first one.'}
                </td>
              </tr>
            ) : (
              partners.map((partner, index) => (
                <tr
                  key={partner.id}
                  draggable={canDrag}
                  onDragStart={() => { dragRef.current = index; setDragIndex(index); }}
                  onDragOver={(e) => { if (canDrag) { e.preventDefault(); setOverIndex(index); } }}
                  onDragEnd={() => { dragRef.current = null; setDragIndex(null); setOverIndex(null); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const from = dragRef.current;
                    if (from !== null) void commitOrder(from, index);
                    dragRef.current = null; setDragIndex(null); setOverIndex(null);
                  }}
                  className={`border-b border-panel-line/30 transition-colors ${
                    overIndex === index && dragIndex !== index ? 'bg-emerald-500/10' : 'hover:bg-panel-surface/40'
                  } ${dragIndex === index ? 'opacity-40' : ''}`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selected.includes(partner.id)}
                        onChange={() =>
                          setSelected((prev) =>
                            prev.includes(partner.id) ? prev.filter((x) => x !== partner.id) : [...prev, partner.id]
                          )
                        }
                        aria-label={`Select ${partner.name}`}
                        className="h-4 w-4 accent-emerald-500"
                      />
                      {canDrag && <span className="cursor-move text-panel-faint" aria-hidden="true">⠿</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {partner.logo_url ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={partner.logo_url}
                        alt={partner.name}
                        className="h-12 w-12 rounded-lg border border-panel-line bg-white object-contain p-1"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-panel-line bg-panel-surface text-xs text-panel-faint">
                        —
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-panel-strong">{partner.name}</span>
                    {partner.description && (
                      <p className="mt-0.5 max-w-xs truncate text-xs text-panel-muted">{partner.description}</p>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    {partner.website_url ? (
                      <a
                        href={partner.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-emerald-400 underline hover:text-emerald-300"
                      >
                        {partner.website_url.replace(/^https?:\/\//, '').slice(0, 28)}
                      </a>
                    ) : (
                      <span className="text-xs text-panel-faint">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${
                      partner.is_active
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                        : 'border-zinc-500/30 bg-zinc-500/10 text-panel-body'
                    }`}>
                      {partner.is_active ? 'Active' : 'Hidden'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <Button size="sm" variant="secondary" onClick={() => openEdit(partner)}>Edit</Button>
                      <Button size="sm" variant="danger" onClick={() => setConfirmDelete(partner)}>Delete</Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add / edit */}
      <Modal
        open={showModal}
        onClose={closeModal}
        title={editing ? `Edit ${editing.name}` : 'Add Partner'}
        maxWidth="max-w-lg"
      >
        <div className="space-y-4">
          <PartnerUpload
            currentUrl={editing?.logo_url ?? null}
            maxSize={MAX_LOGO_BYTES}
            onSelect={(file, error) => {
              setLogoFile(file);
              setErrors((e) => ({ ...e, logo: error }));
            }}
          />
          {errors.logo && <p className="text-xs text-red-400">{errors.logo}</p>}

          <FormField label="Name *" error={errors.name}>
            <Input
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              placeholder="Bright Beginnings Ltd"
              maxLength={255}
            />
          </FormField>

          <FormField label="Website" error={errors.website_url}>
            <Input
              value={form.website_url}
              onChange={(e) => setField('website_url', e.target.value)}
              placeholder="https://partner.com"
            />
          </FormField>

          <FormField label="Description">
            <Textarea
              rows={3}
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
              placeholder="How you work together (optional)."
            />
          </FormField>

          <FormField label="Visibility">
            <Select
              value={form.is_active ? 'active' : 'hidden'}
              onChange={(e) => setField('is_active', e.target.value === 'active')}
              options={[
                { value: 'active', label: 'Active — shown on the homepage' },
                { value: 'hidden', label: 'Hidden — kept but not shown' },
              ]}
            />
          </FormField>

          {saving && (
            <div>
              <p className="mb-1 text-xs text-panel-body">Saving… {progress}%</p>
              <div className="h-2 w-full overflow-hidden rounded-full bg-panel-raised">
                <div className="h-full rounded-full bg-emerald-500 transition-all duration-200" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-panel-line/50 pt-4">
            <Button variant="secondary" onClick={closeModal} disabled={saving}>Cancel</Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Partner'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => void remove()}
        title="Delete partner"
        message={`Delete ${confirmDelete?.name ?? 'this partner'}? The logo will also be removed from Cloudinary.`}
        confirmLabel="Delete"
        destructive
      />
      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}
