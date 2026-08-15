'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '../../../../../lib/api';
import { Button, Modal, FormField, Input, Toast, ConfirmDialog } from '../../../../../components/admin/shared';
import { RichTextEditor } from '../../../../../components/admin/RichTextEditor';

interface Section {
  id: string;
  section_key: string;
  title: string | null;
  content: string | null;
  is_visible: boolean;
  sort_order: number;
  updated_at: string;
  updated_by_name: string | null;
}

interface PageRow {
  id: string;
  title: string;
  slug: string;
  path: string | null;
}

const isEmpty = (html: string | null) => !html || html.replace(/<[^>]*>/g, '').trim() === '';

export default function PageContentEditor() {
  const params = useParams();
  const pageId = String(params?.id ?? '');

  const [page, setPage] = useState<PageRow | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [deletedSections, setDeletedSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ title: '', content: '' });
  const [saving, setSaving] = useState(false);

  const [showNew, setShowNew] = useState(false);
  const [newSection, setNewSection] = useState({ section_key: '', title: '' });

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Section | null>(null);

  const dragRef = useRef<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const ok = (message: string) => setToast({ message, type: 'success' });
  const fail = (message: string) => setToast({ message, type: 'error' });

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [pages, live, gone] = await Promise.all([
        api<{ data: PageRow[] }>('/admin/pages', { params: { limit: 100 } }),
        api<Section[]>(`/admin/pages/${pageId}/content`),
        api<Section[]>(`/admin/pages/${pageId}/content`, { params: { deleted: 'true' } }),
      ]);
      setPage(pages.data.find((p) => p.id === pageId) ?? null);
      setSections(live);
      setDeletedSections(gone);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load content');
    } finally { setLoading(false); }
  }, [pageId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }
  }, [toast]);

  const startEdit = (section: Section) => {
    setEditingId(section.id);
    setDraft({ title: section.title ?? '', content: section.content ?? '' });
  };

  const save = async (sectionId: string) => {
    setSaving(true);
    try {
      await api(`/admin/pages/${pageId}/content/${sectionId}`, {
        method: 'PUT',
        body: JSON.stringify({ title: draft.title.trim() || null, content: draft.content }),
      });
      ok('Section saved');
      setEditingId(null);
      await load();
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Failed to save');
    } finally { setSaving(false); }
  };

  const toggleVisible = async (section: Section) => {
    try {
      await api(`/admin/pages/${pageId}/content/${section.id}`, {
        method: 'PUT', body: JSON.stringify({ is_visible: !section.is_visible }),
      });
      ok(section.is_visible ? 'Section hidden' : 'Section shown');
      await load();
    } catch (err) { fail(err instanceof Error ? err.message : 'Failed to update'); }
  };

  const remove = async () => {
    if (!confirmDelete) return;
    const target = confirmDelete;
    setConfirmDelete(null);
    try {
      await api(`/admin/pages/${pageId}/content/${target.id}`, { method: 'DELETE' });
      ok('Section deleted — it can be restored below');
      await load();
    } catch (err) { fail(err instanceof Error ? err.message : 'Failed to delete'); }
  };

  const restore = async (section: Section) => {
    try {
      await api(`/admin/pages/${pageId}/content/${section.id}/restore`, { method: 'POST' });
      ok('Section restored');
      await load();
    } catch (err) { fail(err instanceof Error ? err.message : 'Failed to restore'); }
  };

  const create = async () => {
    if (!newSection.section_key.trim()) { fail('A section key is required'); return; }
    try {
      await api(`/admin/pages/${pageId}/content`, {
        method: 'POST',
        body: JSON.stringify({
          section_key: newSection.section_key.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-'),
          title: newSection.title.trim() || null,
        }),
      });
      ok('Section added');
      setShowNew(false);
      setNewSection({ section_key: '', title: '' });
      await load();
    } catch (err) { fail(err instanceof Error ? err.message : 'Failed to add section'); }
  };

  const commitOrder = async (from: number, to: number) => {
    if (from === to || to < 0 || to >= sections.length) return;
    const next = [...sections];
    const [moved] = next.splice(from, 1);
    if (moved) next.splice(to, 0, moved);
    setSections(next); // optimistic
    try {
      const res = await api<{ reordered: number; requested: number }>(
        `/admin/pages/${pageId}/content/reorder`,
        { method: 'POST', body: JSON.stringify({ ids: next.map((s) => s.id) }) }
      );
      // The server now answers with the rows it actually moved. A short count
      // means the list on screen is stale, so reload rather than claim success.
      if (res && res.reordered < res.requested) {
        fail('Some sections could not be moved — reloading');
        await load();
        return;
      }
      ok('Order saved');
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Failed to save order');
      await load();
    }
  };

  /**
   * Keyboard- and touch-reachable reordering. Native drag and drop produces no
   * events from touch input, so on a phone the arrows are the only way to do
   * this at all.
   */
  const moveSection = (index: number, direction: 'up' | 'down') =>
    commitOrder(index, direction === 'up' ? index - 1 : index + 1);

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => <div key={i} className="h-32 animate-pulse rounded-xl bg-zinc-800/40" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/admin/pages" className="text-xs text-zinc-500 underline hover:text-zinc-300">
            ← All pages
          </Link>
          <h2 className="mt-1 text-lg font-medium text-zinc-100">
            {page ? `${page.title} — text` : 'Page text'}
          </h2>
          <p className="text-xs text-zinc-500">
            A section appears on the public page once it has text and is visible. Empty sections are
            ignored, so the page keeps its built-in wording until you write something.
            {page?.path && (
              <>
                {' '}
                <a href={page.path} target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-300">
                  View page →
                </a>
              </>
            )}
          </p>
        </div>
        <Button onClick={() => setShowNew(true)} className="shrink-0">+ Add Section</Button>
      </div>

      {loadError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
          <p className="text-sm text-red-300">Could not load content</p>
          <p className="mt-1 text-xs text-red-400/80">{loadError}</p>
          <Button variant="secondary" onClick={() => void load()} className="mt-3">Try again</Button>
        </div>
      )}

      {sections.length === 0 && !loadError ? (
        <p className="rounded-xl border border-zinc-800/50 bg-[#111119] p-10 text-center text-sm text-zinc-500">
          No sections yet. Use “+ Add Section” to create one.
        </p>
      ) : (
        <ul className="space-y-3">
          {sections.map((section, index) => (
            <li
              key={section.id}
              draggable={editingId === null}
              onDragStart={() => { dragRef.current = index; setDragIndex(index); }}
              onDragOver={(e) => { e.preventDefault(); setOverIndex(index); }}
              onDragEnd={() => { dragRef.current = null; setDragIndex(null); setOverIndex(null); }}
              onDrop={(e) => {
                e.preventDefault();
                const from = dragRef.current;
                if (from !== null) void commitOrder(from, index);
                dragRef.current = null; setDragIndex(null); setOverIndex(null);
              }}
              className={`rounded-xl border bg-[#111119] p-5 transition-all ${
                overIndex === index && dragIndex !== index
                  ? 'border-emerald-500 ring-2 ring-emerald-500/30'
                  : 'border-zinc-800/50'
              } ${dragIndex === index ? 'opacity-40' : ''}`}
            >
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {editingId === null && (
                  <span className="flex items-center gap-1">
                    <span className="hidden cursor-move text-zinc-600 sm:inline" aria-hidden="true">⠿</span>
                    <button
                      type="button"
                      onClick={() => void moveSection(index, 'up')}
                      disabled={index === 0}
                      aria-label={`Move ${section.section_key} up`}
                      className="flex min-h-12 min-w-12 items-center justify-center rounded-lg border border-zinc-800 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => void moveSection(index, 'down')}
                      disabled={index === sections.length - 1}
                      aria-label={`Move ${section.section_key} down`}
                      className="flex min-h-12 min-w-12 items-center justify-center rounded-lg border border-zinc-800 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      ▼
                    </button>
                  </span>
                )}
                <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-400">
                  {section.section_key}
                </code>
                <span className={`rounded-full border px-2 py-0.5 text-[11px] ${
                  section.is_visible
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                    : 'border-zinc-500/30 bg-zinc-500/10 text-zinc-400'
                }`}>
                  {section.is_visible ? 'Visible' : 'Hidden'}
                </span>
                {isEmpty(section.content) && (
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-400">
                    Empty — not shown on the site
                  </span>
                )}
                <span className="ml-auto text-[11px] text-zinc-600">
                  {section.updated_by_name ? `${section.updated_by_name} · ` : ''}
                  {new Date(section.updated_at).toLocaleDateString()}
                </span>
              </div>

              {editingId === section.id ? (
                <div className="space-y-3">
                  <FormField label="Heading">
                    <Input
                      value={draft.title}
                      onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                      placeholder="Shown above the text. Leave blank for none."
                      maxLength={255}
                    />
                  </FormField>
                  <RichTextEditor
                    value={draft.content}
                    onChange={(content) => setDraft((d) => ({ ...d, content }))}
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" onClick={() => setEditingId(null)} disabled={saving}>Cancel</Button>
                    <Button onClick={() => void save(section.id)} disabled={saving}>
                      {saving ? 'Saving…' : 'Save'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div>
                  {section.title && <h3 className="mb-2 text-base font-semibold text-zinc-200">{section.title}</h3>}
                  {isEmpty(section.content) ? (
                    <p className="mb-3 text-sm text-zinc-600">No text yet.</p>
                  ) : (
                    <div
                      className="prose-admin mb-3 text-sm text-zinc-400"
                      // Server-sanitised against an allowlist before storage.
                      dangerouslySetInnerHTML={{ __html: section.content ?? '' }}
                    />
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={() => startEdit(section)}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => void toggleVisible(section)}>
                      {section.is_visible ? 'Hide' : 'Show'}
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => setConfirmDelete(section)}>Delete</Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {deletedSections.length > 0 && (
        <div className="rounded-xl border border-zinc-800/50 bg-[#0c0c14] p-5">
          <button
            onClick={() => setShowDeleted((v) => !v)}
            className="text-sm text-zinc-400 hover:text-zinc-200"
          >
            {showDeleted ? '▾' : '▸'} Deleted sections ({deletedSections.length})
          </button>
          {showDeleted && (
            <ul className="mt-3 space-y-2">
              {deletedSections.map((section) => (
                <li key={section.id} className="flex items-center gap-3 rounded-lg bg-[#111119] px-3 py-2">
                  <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-500">
                    {section.section_key}
                  </code>
                  <span className="flex-1 truncate text-sm text-zinc-400">{section.title || '—'}</span>
                  <Button size="sm" variant="secondary" onClick={() => void restore(section)}>Restore</Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Modal open={showNew} onClose={() => setShowNew(false)} title="Add section" maxWidth="max-w-md">
        <div className="space-y-4">
          <FormField label="Section key *">
            <Input
              value={newSection.section_key}
              onChange={(e) => setNewSection((s) => ({ ...s, section_key: e.target.value }))}
              placeholder="e.g. welcome-note"
              maxLength={100}
            />
          </FormField>
          <FormField label="Heading">
            <Input
              value={newSection.title}
              onChange={(e) => setNewSection((s) => ({ ...s, title: e.target.value }))}
              maxLength={255}
            />
          </FormField>
          <div className="flex justify-end gap-2 border-t border-zinc-800/50 pt-4">
            <Button variant="secondary" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button onClick={() => void create()}>Add</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => void remove()}
        title="Delete section"
        message={`Delete "${confirmDelete?.title || confirmDelete?.section_key}"? It can be restored from this page afterwards.`}
        confirmLabel="Delete"
        destructive
      />
      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}
