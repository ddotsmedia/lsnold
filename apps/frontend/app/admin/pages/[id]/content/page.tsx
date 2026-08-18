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
  published_at: string | null;
  scheduled_publish_at: string | null;
}

type PublishState = 'draft' | 'published' | 'scheduled';

/**
 * A section is live once its publish moment has passed — the same rule the
 * public query applies, so this badge never disagrees with the site.
 */
function publishState(section: Section): PublishState {
  if (section.published_at && new Date(section.published_at) <= new Date()) return 'published';
  if (section.scheduled_publish_at) {
    return new Date(section.scheduled_publish_at) <= new Date() ? 'published' : 'scheduled';
  }
  return section.published_at ? 'scheduled' : 'draft';
}

const formatWhen = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';

function PublishBadge({ section }: { section: Section }) {
  const state = publishState(section);
  const styles: Record<PublishState, string> = {
    draft: 'border-zinc-500/30 bg-zinc-500/10 text-panel-body',
    published: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    scheduled: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  };
  const label =
    state === 'published'
      ? `Published ${formatWhen(section.published_at ?? section.scheduled_publish_at)}`
      : state === 'scheduled'
        ? `Scheduled for ${formatWhen(section.scheduled_publish_at ?? section.published_at)}`
        : 'Draft';

  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] ${styles[state]}`}>{label}</span>
  );
}

/**
 * `datetime-local` wants "YYYY-MM-DDTHH:mm" in local time, with no zone. Going
 * through toISOString would shift the value by the browser's offset and show
 * the admin a different time from the one they picked.
 */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface PageRow {
  id: string;
  title: string;
  slug: string;
  path: string | null;
}

const isEmpty = (html: string | null) => !html || html.replace(/<[^>]*>/g, '').trim() === '';

/**
 * Shows the section as the public page will render it.
 *
 * The HTML is put through the server's own sanitiser rather than rendered
 * straight from the editor, so the preview shows what a save would actually
 * keep — if a tag is going to be stripped, it disappears here too instead of
 * surprising the admin after saving. That also keeps one allowlist rather than
 * a second copy in the browser that could drift from it.
 *
 * Declared at module scope: as a nested component it would be a new type on
 * every render, remounting the preview on each keystroke.
 */
function SectionPreview({
  title,
  html,
  className = '',
}: {
  title: string;
  html: string;
  className?: string;
}) {
  const [safeHtml, setSafeHtml] = useState('');
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (isEmpty(html)) { setSafeHtml(''); setStale(false); return; }

    let cancelled = false;
    // The editor already debounces its onChange, so this fires on a pause in
    // typing rather than per keystroke.
    api<{ sanitized: string }>('/admin/pages/sanitize', {
      method: 'POST',
      body: JSON.stringify({ html }),
    })
      .then((res) => {
        if (cancelled) return;
        setSafeHtml(res.sanitized);
        setStale(false);
      })
      // A preview is not worth an error toast. Keep the last good render and
      // say it is behind, so nobody reads it as current.
      .catch(() => { if (!cancelled) setStale(true); });

    return () => { cancelled = true; };
  }, [html]);

  return (
    <div className={className}>
      <div className="mb-1 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-panel-muted">Preview</p>
        {stale && <p className="text-[11px] text-amber-400">Preview is behind</p>}
      </div>
      {/* White ground and the public stylesheet, because that is what a visitor
          sees. A dark preview would misrepresent every colour on the page. */}
      <div className="h-full max-h-125 overflow-y-auto rounded-lg border border-panel-line bg-white p-4">
        {title && <h2 className="mb-3 text-xl font-bold text-gray-800">{title}</h2>}
        {safeHtml ? (
          <div
            className="page-content text-base leading-relaxed text-gray-700"
            // Sanitised server-side by the same function that guards storage.
            dangerouslySetInnerHTML={{ __html: safeHtml }}
          />
        ) : (
          <p className="text-sm text-gray-400">Nothing to preview yet.</p>
        )}
      </div>
    </div>
  );
}

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
  const [confirmUnpublish, setConfirmUnpublish] = useState<Section | null>(null);
  const [confirmBulkUnpublish, setConfirmBulkUnpublish] = useState(false);

  /** The section whose date picker is open, and the value it holds. */
  const [scheduling, setScheduling] = useState<string | null>(null);
  const [scheduleAt, setScheduleAt] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

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

  /* ------------------------------------------------------------ publishing */

  const transition = async (section: Section, action: 'publish' | 'unpublish' | 'unschedule') => {
    try {
      await api(`/admin/pages/${pageId}/content/${section.id}/${action}`, { method: 'POST' });
      ok(action === 'publish' ? 'Section published'
        : action === 'unpublish' ? 'Section unpublished — no longer on the site'
          : 'Schedule removed');
      await load();
    } catch (err) { fail(err instanceof Error ? err.message : `Failed to ${action}`); }
  };

  const schedule = async (section: Section, whenLocal: string) => {
    if (!whenLocal) { fail('Pick a date and time first'); return; }
    try {
      // The input gives local time with no zone; the Date turns it into the
      // instant the admin meant, and the server stores that.
      await api(`/admin/pages/${pageId}/content/${section.id}/schedule`, {
        method: 'POST',
        body: JSON.stringify({ scheduled_publish_at: new Date(whenLocal).toISOString() }),
      });
      ok('Section scheduled');
      setScheduling(null);
      await load();
    } catch (err) { fail(err instanceof Error ? err.message : 'Failed to schedule'); }
  };

  const bulk = async (action: 'publish' | 'unpublish') => {
    const ids = [...selected];
    if (ids.length === 0) return;
    try {
      const res = await api<{ updated: number; requested: number }>(
        `/admin/pages/${pageId}/content/bulk`,
        { method: 'POST', body: JSON.stringify({ ids, action }) }
      );
      ok(`${res.updated} section${res.updated === 1 ? '' : 's'} ${action === 'publish' ? 'published' : 'unpublished'}`);
      setSelected(new Set());
      setConfirmBulkUnpublish(false);
      await load();
    } catch (err) { fail(err instanceof Error ? err.message : 'Failed to update sections'); }
  };

  const toggleSelected = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

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
        {[0, 1, 2].map((i) => <div key={i} className="h-32 animate-pulse rounded-xl bg-panel-raised/40" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/admin/pages" className="text-xs text-panel-muted underline hover:text-panel-body">
            ← All pages
          </Link>
          <h2 className="mt-1 text-lg font-medium text-panel-strong">
            {page ? `${page.title} — text` : 'Page text'}
          </h2>
          <p className="text-xs text-panel-muted">
            A section appears on the public page once it has text and is visible. Empty sections are
            ignored, so the page keeps its built-in wording until you write something.
            {page?.path && (
              <>
                {' '}
                <a href={page.path} target="_blank" rel="noopener noreferrer" className="underline hover:text-panel-body">
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

      {/* Only present once something is ticked, so it never sits there empty
          taking up room above the list. */}
      {selected.size > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 sm:flex-row sm:items-center">
          <p className="text-sm text-panel-body">
            {selected.size} section{selected.size === 1 ? '' : 's'} selected
          </p>
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            <Button size="sm" onClick={() => void bulk('publish')}>Publish selected</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmBulkUnpublish(true)}>
              Unpublish selected
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        </div>
      )}

      {sections.length === 0 && !loadError ? (
        <p className="rounded-xl border border-panel-line/50 bg-panel-surface p-10 text-center text-sm text-panel-muted">
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
              className={`rounded-xl border bg-panel-surface p-5 transition-all ${
                overIndex === index && dragIndex !== index
                  ? 'border-emerald-500 ring-2 ring-emerald-500/30'
                  : 'border-panel-line/50'
              } ${dragIndex === index ? 'opacity-40' : ''}`}
            >
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {editingId === null && (
                  <span className="flex items-center gap-1">
                    <span className="hidden cursor-move text-panel-faint sm:inline" aria-hidden="true">⠿</span>
                    <button
                      type="button"
                      onClick={() => void moveSection(index, 'up')}
                      disabled={index === 0}
                      aria-label={`Move ${section.section_key} up`}
                      className="flex min-h-12 min-w-12 items-center justify-center rounded-lg border border-panel-line text-panel-body transition-colors hover:bg-panel-raised hover:text-panel-strong disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => void moveSection(index, 'down')}
                      disabled={index === sections.length - 1}
                      aria-label={`Move ${section.section_key} down`}
                      className="flex min-h-12 min-w-12 items-center justify-center rounded-lg border border-panel-line text-panel-body transition-colors hover:bg-panel-raised hover:text-panel-strong disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      ▼
                    </button>
                  </span>
                )}
                {editingId === null && (
                  <label className="flex min-h-12 min-w-12 cursor-pointer items-center justify-center">
                    <input
                      type="checkbox"
                      checked={selected.has(section.id)}
                      onChange={() => toggleSelected(section.id)}
                      aria-label={`Select ${section.section_key}`}
                      className="h-4 w-4 accent-emerald-500"
                    />
                  </label>
                )}
                <code className="rounded bg-panel-raised px-1.5 py-0.5 text-[11px] text-panel-body">
                  {section.section_key}
                </code>
                <PublishBadge section={section} />
                {!section.is_visible && (
                  <span className="rounded-full border border-zinc-500/30 bg-zinc-500/10 px-2 py-0.5 text-[11px] text-panel-body">
                    Hidden
                  </span>
                )}
                {isEmpty(section.content) && (
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-400">
                    Empty — not shown on the site
                  </span>
                )}
                <span className="ml-auto text-[11px] text-panel-faint">
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
                  {/* Stacked by default; side by side only once there is room
                      for the preview to be a fair representation of the page.
                      Below that the preview sits under the editor, which is
                      how it reads on a phone anyway. */}
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
                    <div className="lg:col-span-3">
                      <RichTextEditor
                        value={draft.content}
                        onChange={(content) => setDraft((d) => ({ ...d, content }))}
                      />
                    </div>
                    <SectionPreview
                      title={draft.title}
                      html={draft.content}
                      className="lg:col-span-2"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" onClick={() => setEditingId(null)} disabled={saving}>Cancel</Button>
                    <Button onClick={() => void save(section.id)} disabled={saving}>
                      {saving ? 'Saving…' : 'Save'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div>
                  {section.title && <h3 className="mb-2 text-base font-semibold text-panel-strong">{section.title}</h3>}
                  {isEmpty(section.content) ? (
                    <p className="mb-3 text-sm text-panel-faint">No text yet.</p>
                  ) : (
                    <div
                      className="prose-admin mb-3 text-sm text-panel-body"
                      // Server-sanitised against an allowlist before storage.
                      dangerouslySetInnerHTML={{ __html: section.content ?? '' }}
                    />
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={() => startEdit(section)}>Edit</Button>

                    {/* Publishing an empty section would put nothing on the
                        page, so the button waits until there is text. */}
                    {publishState(section) !== 'published' && (
                      <Button
                        size="sm"
                        onClick={() => void transition(section, 'publish')}
                        disabled={isEmpty(section.content)}
                        title={isEmpty(section.content) ? 'Write some text first' : undefined}
                      >
                        Publish now
                      </Button>
                    )}
                    {publishState(section) === 'published' && (
                      <Button size="sm" variant="ghost" onClick={() => setConfirmUnpublish(section)}>
                        Unpublish
                      </Button>
                    )}
                    {publishState(section) === 'scheduled' ? (
                      <Button size="sm" variant="ghost" onClick={() => void transition(section, 'unschedule')}>
                        Unschedule
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isEmpty(section.content)}
                        onClick={() => {
                          setScheduling(scheduling === section.id ? null : section.id);
                          // Defaults an hour out, which is past the "must be in
                          // the future" rule without the admin having to think.
                          setScheduleAt(toLocalInput(new Date(Date.now() + 60 * 60 * 1000)));
                        }}
                      >
                        Schedule…
                      </Button>
                    )}

                    <Button size="sm" variant="ghost" onClick={() => void toggleVisible(section)}>
                      {section.is_visible ? 'Hide' : 'Show'}
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => setConfirmDelete(section)}>Delete</Button>
                  </div>

                  {scheduling === section.id && (
                    <div className="mt-3 flex flex-col gap-2 rounded-lg border border-panel-line bg-panel-sunken p-3 sm:flex-row sm:items-end">
                      <div className="flex-1">
                        <label
                          htmlFor={`schedule-${section.id}`}
                          className="mb-1 block text-xs font-medium uppercase tracking-wider text-panel-body"
                        >
                          Publish at
                        </label>
                        <input
                          id={`schedule-${section.id}`}
                          type="datetime-local"
                          value={scheduleAt}
                          min={toLocalInput(new Date())}
                          onChange={(e) => setScheduleAt(e.target.value)}
                          className="min-h-12 w-full rounded-lg border border-panel-line bg-panel-sunken px-3 text-sm text-panel-strong focus:border-emerald-500/50 focus:outline-none"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => void schedule(section, scheduleAt)}>Set</Button>
                        <Button size="sm" variant="secondary" onClick={() => setScheduling(null)}>Cancel</Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {deletedSections.length > 0 && (
        <div className="rounded-xl border border-panel-line/50 bg-panel-sunken p-5">
          <button
            onClick={() => setShowDeleted((v) => !v)}
            className="text-sm text-panel-body hover:text-panel-strong"
          >
            {showDeleted ? '▾' : '▸'} Deleted sections ({deletedSections.length})
          </button>
          {showDeleted && (
            <ul className="mt-3 space-y-2">
              {deletedSections.map((section) => (
                <li key={section.id} className="flex items-center gap-3 rounded-lg bg-panel-surface px-3 py-2">
                  <code className="rounded bg-panel-raised px-1.5 py-0.5 text-[11px] text-panel-muted">
                    {section.section_key}
                  </code>
                  <span className="flex-1 truncate text-sm text-panel-body">{section.title || '—'}</span>
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
          <div className="flex justify-end gap-2 border-t border-panel-line/50 pt-4">
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
      <ConfirmDialog
        open={!!confirmUnpublish}
        onClose={() => setConfirmUnpublish(null)}
        onConfirm={() => { if (confirmUnpublish) void transition(confirmUnpublish, 'unpublish'); }}
        title="Unpublish section"
        message="This section will no longer be visible on the public page. Its text is kept and it can be published again. Continue?"
        confirmLabel="Unpublish"
        destructive
      />

      <ConfirmDialog
        open={confirmBulkUnpublish}
        onClose={() => setConfirmBulkUnpublish(false)}
        onConfirm={() => void bulk('unpublish')}
        title="Unpublish sections"
        message={`${selected.size} section${selected.size === 1 ? '' : 's'} will no longer be visible on the public page. Their text is kept. Continue?`}
        confirmLabel="Unpublish"
        destructive
      />

      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}
