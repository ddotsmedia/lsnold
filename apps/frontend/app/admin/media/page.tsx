'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import type { PaginatedResponse } from '../../../lib/api';
import {
  Button, Modal, FormField, Input, Textarea, Select, SearchBar, Toast, ConfirmDialog,
} from '../../../components/admin/shared';
import {
  ImageUploader, ImageGallery, MediaLibrary, formatBytes,
} from '../../../components/admin/MediaKit';
import type { MediaItem, MediaCategory } from '../../../components/admin/MediaKit';
import { slotsForPage } from '../../../components/admin/PageImagesTab';

/* ------------------------------------------------------------------ config */

type Tab = 'site' | 'age-groups' | 'pages' | 'library';

const TABS: { key: Tab; label: string }[] = [
  { key: 'site', label: 'Site-Wide' },
  { key: 'age-groups', label: 'Age Groups' },
  { key: 'pages', label: 'Pages' },
  { key: 'library', label: 'Media Library' },
];

/** Keys the public site reads. Favicon is listed but see the note in the UI. */
const SITE_SLOTS = [
  { key: 'logo', label: 'Logo', hint: 'Shown in the header on every page.' },
  { key: 'header_bg', label: 'Header Background', hint: 'Optional background behind the header.' },
  { key: 'footer_logo', label: 'Footer Logo', hint: 'Falls back to the main logo.' },
  { key: 'favicon', label: 'Favicon', hint: 'The browser tab icon. Falls back to the logo when empty.' },
] as const;

/** Slugs match the ones the public age-groups page uses. */
const AGE_GROUPS = [
  { slug: 'bouncing-bunnies', name: 'Bouncing Bunnies' },
  { slug: 'precious-pandas', name: 'Precious Pandas' },
  { slug: 'gentle-giraffes', name: 'Gentle Giraffes' },
  { slug: 'dazzling-dolphins', name: 'Dazzling Dolphins' },
  { slug: 'fuzzy-foxes', name: 'Fuzzy Foxes' },
  { slug: 'cuddly-camels', name: 'Cuddly Camels' },
] as const;

const PAGES = [
  { slug: 'home', label: 'Home' },
  { slug: 'nursery', label: 'About' },
  { slug: 'gallery', label: 'Gallery' },
  { slug: 'events', label: 'News & Events' },
  { slug: 'contact', label: 'Contact' },
  { slug: 'facilities', label: 'Facilities' },
  { slug: 'age-groups', label: 'Age Groups' },
] as const;

/**
 * Underscored, matching the page editor and what the public pages read. This
 * tab used to write feature1/feature2/feature3 while /admin/pages/:id/images
 * wrote feature_1/feature_2/feature_3, so an image uploaded here landed in a
 * slot nothing rendered.
 */
/**
 * The list itself lives in PageImagesTab, so this tab and the page editor
 * cannot drift apart the way feature1/feature_1 once did.
 */

interface AgeGroupMedia {
  ageGroup: string;
  images: {
    hero: MediaItem | null;
    icon: MediaItem | null;
    banner: MediaItem | null;
    gallery: MediaItem[];
  };
}

interface PageMediaResponse {
  page: string;
  sections: Record<string, MediaItem | undefined>;
}

/**
 * Declared at module scope, not inside the page component. A component defined
 * inside another is a new type on every render, so React unmounts and remounts
 * its whole subtree on each state change — which throws away the file input and
 * an in-flight upload's progress along with it.
 */
function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-panel-line/50 bg-panel-surface p-6">
      <h3 className="text-sm font-medium text-panel-body">{title}</h3>
      {hint && <p className="mt-0.5 text-xs text-panel-muted">{hint}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

/* -------------------------------------------------------------------- page */

export default function MediaPage() {
  const [tab, setTab] = useState<Tab>('site');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Site
  const [siteMedia, setSiteMedia] = useState<Record<string, MediaItem>>({});

  // Age groups
  const [ageSlug, setAgeSlug] = useState<string>(AGE_GROUPS[0].slug);
  const [ageMedia, setAgeMedia] = useState<AgeGroupMedia['images'] | null>(null);

  // Pages
  const [pageSlug, setPageSlug] = useState<string>(PAGES[0].slug);
  const [pageMedia, setPageMedia] = useState<Record<string, MediaItem | undefined>>({});

  // Library
  const [library, setLibrary] = useState<MediaItem[]>([]);
  const [libLoading, setLibLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'' | MediaCategory>('');
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<MediaItem | null>(null);
  const [editForm, setEditForm] = useState({ title: '', alt_text: '', description: '' });
  const [confirm, setConfirm] = useState<{ message: string; run: () => Promise<void> } | null>(null);

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }
  }, [toast]);

  const ok = (message: string) => setToast({ message, type: 'success' });
  const fail = (err: unknown, fallback: string) =>
    setToast({ message: err instanceof Error ? err.message : fallback, type: 'error' });

  /* --------------------------------------------------------------- loaders */

  const loadSite = useCallback(async () => {
    try { setSiteMedia(await api<Record<string, MediaItem>>('/admin/media/site')); }
    catch (err) { fail(err, 'Failed to load site media'); }
  }, []);

  const loadAge = useCallback(async (slug: string) => {
    try {
      const res = await api<AgeGroupMedia>(`/admin/media/age-groups/${slug}`);
      setAgeMedia(res.images);
    } catch (err) { fail(err, 'Failed to load age group images'); }
  }, []);

  const loadPage = useCallback(async (slug: string) => {
    try {
      const res = await api<PageMediaResponse>(`/admin/media/pages/${slug}`);
      setPageMedia(res.sections);
    } catch (err) { fail(err, 'Failed to load page images'); }
  }, []);

  const loadLibrary = useCallback(async () => {
    setLibLoading(true);
    try {
      const res = await api<PaginatedResponse<MediaItem>>('/admin/media', {
        params: { limit: 60, search, type: filter || undefined },
      });
      setLibrary(res.data);
    } catch (err) { fail(err, 'Failed to load media'); }
    finally { setLibLoading(false); }
  }, [search, filter]);

  useEffect(() => { void loadSite(); }, [loadSite]);
  useEffect(() => { if (tab === 'age-groups') void loadAge(ageSlug); }, [tab, ageSlug, loadAge]);
  useEffect(() => { if (tab === 'pages') void loadPage(pageSlug); }, [tab, pageSlug, loadPage]);
  useEffect(() => { if (tab === 'library') void loadLibrary(); }, [tab, loadLibrary]);

  /* --------------------------------------------------------------- actions */

  const assignSite = async (key: string, items: MediaItem[]) => {
    const item = items[0];
    if (!item) return;
    try {
      await api('/admin/media/site', { method: 'POST', body: JSON.stringify({ media_key: key, media_id: item.id }) });
      ok('Image saved');
      await loadSite();
    } catch (err) { fail(err, 'Failed to save'); }
  };

  const clearSite = async (key: string) => {
    try {
      await api('/admin/media/site', { method: 'POST', body: JSON.stringify({ media_key: key, media_id: null }) });
      ok('Image removed');
      await loadSite();
    } catch (err) { fail(err, 'Failed to remove'); }
  };

  const assignAge = async (type: string, items: MediaItem[]) => {
    try {
      for (const item of items) {
        await api(`/admin/media/age-groups/${ageSlug}`, {
          method: 'POST',
          body: JSON.stringify({ media_id: item.id, image_type: type }),
        });
      }
      ok(items.length > 1 ? `${items.length} images added` : 'Image saved');
      await loadAge(ageSlug);
    } catch (err) { fail(err, 'Failed to save'); }
  };

  const unassign = async (kind: 'age-group' | 'page', assignmentId: string, reload: () => Promise<void>) => {
    try {
      await api(`/admin/media/assignments/${kind}/${assignmentId}`, { method: 'DELETE' });
      ok('Image removed');
      await reload();
    } catch (err) { fail(err, 'Failed to remove'); }
  };

  const reorderGallery = async (orderedIds: string[]) => {
    // Optimistic: the grid reorders immediately, then the server catches up.
    setAgeMedia((prev) => {
      if (!prev) return prev;
      const byId = new Map(prev.gallery.map((g) => [g.assignment_id ?? g.id, g]));
      const next = orderedIds.map((id) => byId.get(id)).filter(Boolean) as MediaItem[];
      return { ...prev, gallery: next };
    });
    try {
      await api(`/admin/media/age-groups/${ageSlug}/reorder`, {
        method: 'POST', body: JSON.stringify({ ids: orderedIds }),
      });
      ok('Order saved');
    } catch (err) {
      fail(err, 'Failed to save order');
      await loadAge(ageSlug);
    }
  };

  const assignPage = async (section: string, items: MediaItem[]) => {
    const item = items[0];
    if (!item) return;
    try {
      await api(`/admin/media/pages/${pageSlug}`, {
        method: 'POST', body: JSON.stringify({ media_id: item.id, media_section: section }),
      });
      ok('Image saved');
      await loadPage(pageSlug);
    } catch (err) { fail(err, 'Failed to save'); }
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      await api(`/admin/media/${editing.id}`, { method: 'PUT', body: JSON.stringify(editForm) });
      ok('Details updated');
      setEditing(null);
      await Promise.all([loadLibrary(), loadSite()]);
    } catch (err) { fail(err, 'Failed to update'); }
  };

  const deleteSelected = () => {
    setConfirm({
      message: `Delete ${selected.length} image${selected.length === 1 ? '' : 's'}? They will also be removed from Cloudinary and from anywhere they are used.`,
      run: async () => {
        try {
          const res = await api<{ deleted: number }>('/admin/media/bulk-delete', {
            method: 'POST', body: JSON.stringify({ ids: selected }),
          });
          ok(`${res.deleted} image${res.deleted === 1 ? '' : 's'} deleted`);
          setSelected([]);
          await Promise.all([loadLibrary(), loadSite()]);
        } catch (err) { fail(err, 'Failed to delete'); }
      },
    });
  };

  /* ---------------------------------------------------------------- render */

  return (
    <div className="space-y-6">
      <div className="flex gap-1 overflow-x-auto border-b border-panel-line" role="tablist" aria-label="Media sections">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.key)}
              className={`-mb-px shrink-0 rounded-t-lg border-b-2 px-5 py-3 text-sm font-medium transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 ${
                active
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-panel-muted hover:border-panel-line-2 hover:text-panel-body'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ---------------------------------------------------------- site */}
      {tab === 'site' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SITE_SLOTS.map((slot) => (
            <Section key={slot.key} title={slot.label} hint={slot.hint}>
              <ImageUploader
                category="site"
                compact
                preview={siteMedia[slot.key]?.url ?? null}
                previewAlt={siteMedia[slot.key]?.alt_text ?? ''}
                onUpload={(items) => assignSite(slot.key, items)}
                onRemove={siteMedia[slot.key] ? () => void clearSite(slot.key) : undefined}
              />
            </Section>
          ))}
        </div>
      )}

      {/* ----------------------------------------------------- age groups */}
      {tab === 'age-groups' && (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            {AGE_GROUPS.map((group) => (
              <button
                key={group.slug}
                onClick={() => setAgeSlug(group.slug)}
                className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                  ageSlug === group.slug
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400'
                    : 'border-panel-line bg-panel-surface/40 text-panel-body hover:text-panel-strong'
                }`}
              >
                {group.name}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {(['hero', 'icon', 'banner'] as const).map((type) => (
              <Section key={type} title={type[0]!.toUpperCase() + type.slice(1)}>
                <ImageUploader
                  category="age-groups"
                  compact
                  preview={ageMedia?.[type]?.url ?? null}
                  previewAlt={ageMedia?.[type]?.alt_text ?? ''}
                  onUpload={(items) => assignAge(type, items)}
                  onRemove={
                    ageMedia?.[type]?.assignment_id
                      ? () => void unassign('age-group', ageMedia[type]!.assignment_id!, () => loadAge(ageSlug))
                      : undefined
                  }
                />
              </Section>
            ))}
          </div>

          <Section title="Gallery" hint="Drag the images to change the order they appear in.">
            <div className="space-y-4">
              <ImageUploader
                category="age-groups"
                multiple
                label="Add images"
                onUpload={(items) => assignAge('gallery', items)}
              />
              <ImageGallery
                images={ageMedia?.gallery ?? []}
                onReorder={(ids) => void reorderGallery(ids)}
                onDelete={(item) =>
                  item.assignment_id && void unassign('age-group', item.assignment_id, () => loadAge(ageSlug))
                }
              />
            </div>
          </Section>
        </div>
      )}

      {/* ---------------------------------------------------------- pages */}
      {tab === 'pages' && (
        <div className="space-y-6">
          <div className="max-w-xs">
            <FormField label="Page">
              <Select
                value={pageSlug}
                onChange={(e) => setPageSlug(e.target.value)}
                options={PAGES.map((p) => ({ value: p.slug, label: p.label }))}
              />
            </FormField>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {slotsForPage(pageSlug).map((section) => (
              <Section key={section.key} title={section.label}>
                <ImageUploader
                  category="pages"
                  compact
                  preview={pageMedia[section.key]?.url ?? null}
                  previewAlt={pageMedia[section.key]?.alt_text ?? ''}
                  onUpload={(items) => assignPage(section.key, items)}
                  onRemove={
                    pageMedia[section.key]?.assignment_id
                      ? () => void unassign('page', pageMedia[section.key]!.assignment_id!, () => loadPage(pageSlug))
                      : undefined
                  }
                />
              </Section>
            ))}
          </div>
        </div>
      )}

      {/* -------------------------------------------------------- library */}
      {tab === 'library' && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 flex-col gap-3 sm:flex-row">
              <div className="w-full sm:max-w-xs">
                <SearchBar value={search} onChange={setSearch} placeholder="Search title or alt text..." />
              </div>
              <Select
                value={filter}
                onChange={(e) => setFilter(e.target.value as '' | MediaCategory)}
                options={[
                  { value: '', label: 'All types' },
                  { value: 'site', label: 'Site-wide' },
                  { value: 'age-groups', label: 'Age groups' },
                  { value: 'pages', label: 'Pages' },
                ]}
                className="sm:w-44"
              />
            </div>
            {selected.length > 0 && (
              <Button variant="danger" onClick={deleteSelected}>
                Delete {selected.length} selected
              </Button>
            )}
          </div>

          <MediaLibrary
            items={library}
            loading={libLoading}
            selectedIds={selected}
            onToggleSelect={(id) =>
              setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
            }
            onEdit={(item) => {
              setEditing(item);
              setEditForm({
                title: item.title,
                alt_text: item.alt_text ?? '',
                description: item.description ?? '',
              });
            }}
            emptyMessage={search || filter ? 'Nothing matches that search.' : 'No images yet. Upload one from any tab above.'}
          />
        </div>
      )}

      {/* Edit details */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Image details" maxWidth="max-w-lg">
        {editing && (
          <div className="space-y-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={editing.url} alt={editing.alt_text ?? ''} className="h-40 w-full rounded-lg object-cover" />
            <p className="text-xs text-panel-muted">
              {editing.width}×{editing.height} · {formatBytes(editing.file_size)} · {editing.mime_type}
            </p>
            <FormField label="Title">
              <Input value={editForm.title} onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))} />
            </FormField>
            <FormField label="Alt text" error={editForm.alt_text.trim() ? undefined : 'Screen readers announce this. Describe the image.'}>
              <Input
                value={editForm.alt_text}
                onChange={(e) => setEditForm((f) => ({ ...f, alt_text: e.target.value }))}
                placeholder="Children playing in the classroom"
              />
            </FormField>
            <FormField label="Description">
              <Textarea
                rows={3}
                value={editForm.description}
                onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
              />
            </FormField>
            <div className="flex justify-between gap-2 border-t border-panel-line/50 pt-4">
              <Button
                variant="danger"
                onClick={() =>
                  setConfirm({
                    message: 'Delete this image? It will be removed from Cloudinary and from anywhere it is used.',
                    run: async () => {
                      try {
                        await api(`/admin/media/${editing.id}`, { method: 'DELETE' });
                        ok('Image deleted');
                        setEditing(null);
                        await Promise.all([loadLibrary(), loadSite()]);
                      } catch (err) { fail(err, 'Failed to delete'); }
                    },
                  })
                }
              >
                Delete
              </Button>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
                <Button onClick={saveEdit}>Save</Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => { const c = confirm; setConfirm(null); void c?.run(); }}
        title="Delete image"
        message={confirm?.message ?? ''}
        confirmLabel="Delete"
        destructive
      />
      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}
