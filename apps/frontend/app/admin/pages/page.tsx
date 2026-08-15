'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '../../../lib/api';
import type { PaginatedResponse } from '../../../lib/api';
import { DataTable } from '../../../components/admin/DataTable';
import type { Column } from '../../../components/admin/DataTable';
import { StatusBadge, SearchBar, FilterSelect, Button, Modal, FormField, Input, Textarea, Toast, ConfirmDialog } from '../../../components/admin/shared';
import { PageImagesTab } from '../../../components/admin/PageImagesTab';

interface Page {
  id: string; title: string; slug: string; status: string;
  meta_title: string; meta_description: string; meta_keywords: string; og_image: string;
  created_by_name: string; created_at: string; updated_at: string;
}

const EMPTY = { title: '', slug: '', status: 'draft', meta_title: '', meta_description: '', meta_keywords: '', og_image: '' };

export default function PagesPage() {
  const [data, setData] = useState<Page[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  // Images live on a saved page, so the tab only appears once there is an id.
  const [modalTab, setModalTab] = useState<'content' | 'images'>('content');

  const fetchData = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const res = await api<PaginatedResponse<Page>>('/admin/pages', { params: { page, limit: 20, search, status: statusFilter } });
      setData(res.data);
      setPagination(res.pagination);
    } catch { setToast({ message: 'Failed to load pages', type: 'error' }); }
    finally { setLoading(false); }
  }, [search, statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); } }, [toast]);

  const openEdit = (p: Page) => {
    setEditId(p.id);
    setForm({ title: p.title, slug: p.slug, status: p.status, meta_title: p.meta_title || '', meta_description: p.meta_description || '', meta_keywords: p.meta_keywords || '', og_image: p.og_image || '' });
    setModalTab('content');
    setShowModal(true);
  };

  const save = async () => {
    try {
      if (editId) { await api(`/admin/pages/${editId}`, { method: 'PUT', body: JSON.stringify(form) }); }
      else { await api('/admin/pages', { method: 'POST', body: JSON.stringify(form) }); }
      setToast({ message: `Page ${editId ? 'updated' : 'created'}`, type: 'success' });
      setShowModal(false); setEditId(null); setForm(EMPTY); fetchData(pagination.page);
    } catch (e) { setToast({ message: (e as Error).message || 'Failed to save', type: 'error' }); }
  };

  const togglePublish = async (id: string, current: string) => {
    try {
      await api(`/admin/pages/${id}/${current === 'published' ? 'unpublish' : 'publish'}`, { method: 'POST' });
      setToast({ message: `Page ${current === 'published' ? 'unpublished' : 'published'}`, type: 'success' });
      fetchData(pagination.page);
    } catch { setToast({ message: 'Failed to update status', type: 'error' }); }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try { await api(`/admin/pages/${confirmDelete}`, { method: 'DELETE' }); setToast({ message: 'Deleted', type: 'success' }); fetchData(pagination.page); }
    catch { setToast({ message: 'Failed to delete', type: 'error' }); }
    setConfirmDelete(null);
  };

  const setField = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const columns: Column<Page>[] = [
    { key: 'title', header: 'Title', sortable: true, render: (r) => <span className="font-medium">{r.title}</span> },
    { key: 'slug', header: 'Slug', render: (r) => <span className="text-xs text-zinc-500">/{r.slug}</span> },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'created_by_name', header: 'Author', render: (r) => <span className="text-xs text-zinc-400">{r.created_by_name || '—'}</span> },
    { key: 'updated_at', header: 'Updated', render: (r) => <span className="text-xs text-zinc-500">{new Date(r.updated_at).toLocaleDateString()}</span> },
    { key: 'actions', header: '', className: 'w-[200px]', render: (r) => (
      <div className="flex gap-1">
        <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); openEdit(r); }}>Edit</Button>
        <Link
          href={`/admin/pages/${r.id}/content`}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
        >
          Text
        </Link>
        <Button size="sm" variant={r.status === 'published' ? 'ghost' : 'primary'} onClick={(e) => { e.stopPropagation(); togglePublish(r.id, r.status); }}>
          {r.status === 'published' ? 'Unpublish' : 'Publish'}
        </Button>
        <Button size="sm" variant="danger" onClick={(e) => { e.stopPropagation(); setConfirmDelete(r.id); }}>×</Button>
      </div>
    )},
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-3">
        <div className="flex gap-3 flex-1">
          <div className="flex-1 max-w-xs"><SearchBar value={search} onChange={setSearch} placeholder="Search pages..." /></div>
          <FilterSelect value={statusFilter} onChange={setStatusFilter} options={[
            { value: 'draft', label: 'Draft' }, { value: 'published', label: 'Published' }, { value: 'archived', label: 'Archived' },
          ]} allLabel="All Status" />
        </div>
        <Button onClick={() => { setEditId(null); setForm(EMPTY); setModalTab('content'); setShowModal(true); }}>+ New Page</Button>
      </div>

      <DataTable columns={columns} data={data} loading={loading} pagination={pagination} onPageChange={(p) => fetchData(p)} />

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editId ? 'Edit Page' : 'New Page'} maxWidth="max-w-3xl">
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
          {/* Only offered for a saved page: image slots are keyed to its id. */}
          {editId && (
            <div className="flex gap-1 border-b border-zinc-800" role="tablist" aria-label="Page editor sections">
              {([['content', 'Details & SEO'], ['images', 'Images']] as const).map(([key, label]) => {
                const active = modalTab === key;
                return (
                  <button
                    key={key}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setModalTab(key)}
                    className={`-mb-px rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                      active
                        ? 'border-emerald-500 text-emerald-400'
                        : 'border-transparent text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {editId && modalTab === 'images' ? (
            <PageImagesTab
              pageId={editId}
              pageSlug={form.slug}
              onToast={(message, type) => setToast({ message, type })}
            />
          ) : (
          <>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Title"><Input value={form.title} onChange={(e) => setField('title', e.target.value)} /></FormField>
            <FormField label="Slug"><Input value={form.slug} onChange={(e) => setField('slug', e.target.value)} placeholder="url-friendly-name" /></FormField>
          </div>
          {/* The page's words are edited as sections, which is what the public
              site renders. The old textarea here wrote pages.content, which
              nothing reads — text typed into it silently went nowhere. */}
          {editId && (
            <div className="rounded-lg border border-zinc-800 bg-[#0c0c14] p-4">
              <p className="text-sm text-zinc-300">Page text</p>
              <p className="mt-1 text-xs text-zinc-500">
                Headings and paragraphs for this page are edited as sections, so they can be
                reordered and hidden individually.
              </p>
              <Link
                href={`/admin/pages/${editId}/content`}
                className="mt-3 inline-flex min-h-12 min-w-12 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800"
              >
                Edit page text →
              </Link>
            </div>
          )}
          <FormField label="Status">
            <select value={form.status} onChange={(e) => setField('status', e.target.value)} className="w-full bg-[#0c0c14] border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-zinc-200">
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </FormField>
          <div className="border-t border-zinc-800/50 pt-4">
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">SEO Metadata</p>
            <div className="space-y-3">
              <FormField label="Meta Title"><Input value={form.meta_title} onChange={(e) => setField('meta_title', e.target.value)} /></FormField>
              <FormField label="Meta Description"><Textarea value={form.meta_description} onChange={(e) => setField('meta_description', e.target.value)} rows={2} /></FormField>
              <FormField label="Meta Keywords"><Input value={form.meta_keywords} onChange={(e) => setField('meta_keywords', e.target.value)} placeholder="comma, separated, keywords" /></FormField>
              <FormField label="OG Image URL"><Input value={form.og_image} onChange={(e) => setField('og_image', e.target.value)} placeholder="https://..." /></FormField>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={save}>{editId ? 'Update' : 'Create'}</Button>
          </div>
          </>
          )}
        </div>
      </Modal>

      <ConfirmDialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)} onConfirm={handleDelete} title="Delete Page" message="This page will be permanently removed." confirmLabel="Delete" destructive />
      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}
