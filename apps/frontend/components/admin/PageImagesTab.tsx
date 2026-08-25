'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from './shared';

/**
 * Image slots for one page, inside the page editor.
 *
 * Talks to /admin/pages/:id/images, which stores into the same page_media table
 * the Media Library's Pages tab uses — so an image set here shows up there and
 * on the public page immediately.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

interface Slot { key: string; label: string; hint: string }

const SLOTS: Slot[] = [
  { key: 'hero', label: 'Hero', hint: 'Sits behind the page heading.' },
  { key: 'feature_1', label: 'Feature 1', hint: 'First feature block.' },
  { key: 'feature_2', label: 'Feature 2', hint: 'Second feature block.' },
  { key: 'feature_3', label: 'Feature 3', hint: 'Third feature block.' },
  { key: 'background', label: 'Background', hint: 'Optional section background.' },
];

/**
 * Slots that only one page has a place for. Offering these everywhere would
 * mean seven pages with an upload box that renders nothing.
 */
const EXTRA_SLOTS: Record<string, Slot[]> = {
  home: [
    { key: 'hero_2', label: 'Hero slide 2', hint: 'Second slide of the home carousel.' },
    { key: 'hero_3', label: 'Hero slide 3', hint: 'Third slide of the home carousel.' },
    { key: 'hero_4', label: 'Hero slide 4', hint: 'Fourth slide of the home carousel.' },
    { key: 'hero_5', label: 'Hero slide 5', hint: 'Fifth slide of the home carousel.' },
    {
      key: 'about',
      label: 'About photo',
      hint: 'The picture beside “Little Smarties Nursery” on the home page.',
    },
  ],
};

/**
 * Two slugs reach this function for the same page. The page editor passes the
 * pages-table slug ("about"), the Media Library passes the route the images are
 * stored under ("nursery"). Both have to find the same overrides.
 */
const SLUG_ALIASES: Record<string, string> = {
  about: 'nursery',
  'news-events': 'events',
};

/**
 * Labels naming what a slot actually illustrates, where a page has a settled
 * answer. "Feature 2" tells an admin nothing about which block on the page
 * they are replacing.
 *
 * Only the label and hint are overridden; the keys stay as they are, because
 * they are what the public page reads and what the rows are stored under.
 *
 * These name the blocks as the page ships. The headings themselves are
 * editable under Pages -> Text, so a renamed section can leave a label behind
 * — worth a look here when one is renamed.
 */
const SLOT_OVERRIDES: Record<string, Record<string, Partial<Slot>>> = {
  nursery: {
    feature_1: {
      label: 'Intro photo',
      hint: 'Beside “Little Smarties Early Learning Centre”, near the top.',
    },
    feature_2: { label: 'Learning Through Play', hint: 'First philosophy block.' },
    feature_3: { label: 'Every Child on Their Own Path', hint: 'Second philosophy block.' },
    background: {
      label: 'A Partnership With Families',
      hint: 'Third philosophy block. Tinted until an image is set.',
    },
  },
};

export function slotsForPage(slug?: string): Slot[] {
  const key = slug ? SLUG_ALIASES[slug] ?? slug : undefined;
  const all = [...SLOTS, ...(key ? EXTRA_SLOTS[key] ?? [] : [])];
  const overrides = key ? SLOT_OVERRIDES[key] : undefined;
  if (!overrides) return all;
  return all.map((slot) => (overrides[slot.key] ? { ...slot, ...overrides[slot.key] } : slot));
}

interface SlotImage {
  assignment_id: string;
  media_id: string;
  url: string;
  alt_text: string | null;
  title: string;
  width: number | null;
  height: number | null;
  file_size: number | null;
}

type Slots = Record<string, SlotImage | null>;

const MAX_BYTES = 10 * 1024 * 1024;

function formatBytes(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** XHR, because fetch cannot report upload progress. */
function uploadToSlot(
  pageId: string,
  slot: string,
  file: File,
  onProgress: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);

    const xhr = new XMLHttpRequest();
    // PUT :slot replaces whatever is in the slot, which is what both an empty
    // slot and a "replace" action want.
    xhr.open('PUT', `${API_BASE}/admin/pages/${pageId}/images/${slot}`);
    const token = typeof window !== 'undefined' ? localStorage.getItem('lsn_token') : null;
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

function SlotCard({
  pageId, slot, label, hint, image, onChanged, onError,
}: {
  pageId: string;
  slot: string;
  label: string;
  hint: string;
  image: SlotImage | null;
  onChanged: (message: string) => void;
  onError: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { onError(`${file.name} is not an image`); return; }
    if (file.size > MAX_BYTES) { onError(`${file.name} is larger than 10 MB`); return; }

    setBusy(true);
    setProgress(0);
    try {
      await uploadToSlot(pageId, slot, file, setProgress);
      onChanged(`${label} image saved`);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
      setProgress(0);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const token = localStorage.getItem('lsn_token');
      const res = await fetch(`${API_BASE}/admin/pages/${pageId}/images/${slot}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || `Failed (${res.status})`);
      }
      onChanged(`${label} image removed`);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to remove');
    } finally { setBusy(false); }
  };

  return (
    <div className="rounded-xl border border-panel-line/50 bg-panel-sunken p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-panel-body">{label}</p>
          <p className="text-xs text-panel-faint">{hint}</p>
        </div>
        <code className="shrink-0 rounded bg-panel-raised px-1.5 py-0.5 text-[10px] text-panel-muted">{slot}</code>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); void handleFiles(e.dataTransfer.files); }}
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
        role="button"
        tabIndex={0}
        aria-label={image ? `Replace the ${label} image` : `Upload a ${label} image`}
        className={`relative flex h-32 cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed transition-colors ${
          dragging ? 'border-emerald-500 bg-emerald-500/10' : 'border-panel-line-2 hover:border-panel-line-2'
        }`}
      >
        {busy ? (
          <div className="w-full px-5 text-center">
            <p className="mb-2 text-xs text-panel-body">{progress > 0 ? `Uploading… ${progress}%` : 'Working…'}</p>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel-raised">
              <div className="h-full rounded-full bg-emerald-500 transition-all duration-200" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : image ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.url} alt={image.alt_text ?? ''} className="h-full w-full object-cover" />
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 opacity-0 transition-opacity hover:opacity-100">
              <span className="rounded-lg bg-panel-surface/90 px-3 py-1.5 text-xs text-panel-strong">Replace</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); void remove(); }}
                className="rounded-lg bg-red-500/25 px-3 py-1.5 text-xs text-red-200 hover:bg-red-500/40"
              >
                Remove
              </button>
            </div>
          </>
        ) : (
          <div className="px-4 text-center">
            <p className="text-xl" aria-hidden="true">⬆</p>
            <p className="mt-0.5 text-xs text-panel-body">Drop an image or click</p>
          </div>
        )}
      </div>

      {image && !busy && (
        <p className="mt-2 truncate text-[11px] text-panel-faint">
          {image.width && image.height ? `${image.width}×${image.height}` : ''}
          {image.file_size ? ` · ${formatBytes(image.file_size)}` : ''}
          {image.alt_text ? ` · ${image.alt_text}` : ''}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />
    </div>
  );
}

export function PageImagesTab({
  pageId,
  pageSlug,
  onToast,
}: {
  pageId: string;
  /** Decides whether this page gets any slots beyond the shared five. */
  pageSlug?: string;
  onToast: (message: string, type: 'success' | 'error') => void;
}) {
  const visibleSlots = slotsForPage(pageSlug);
  const [slots, setSlots] = useState<Slots>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('lsn_token');
      const res = await fetch(`${API_BASE}/admin/pages/${pageId}/images`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || `Failed to load (${res.status})`);
      }
      const data = (await res.json()) as { slots?: Slots };
      setSlots(data.slots ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load images');
    } finally { setLoading(false); }
  }, [pageId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {visibleSlots.map((s) => <div key={s.key} className="h-52 animate-pulse rounded-xl bg-panel-raised/40" />)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
        <p className="text-sm text-red-300">Could not load images</p>
        <p className="mt-1 text-xs text-red-400/80">{error}</p>
        <Button variant="secondary" onClick={() => void load()} className="mt-3">Try again</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-panel-muted">
        These images appear on the public page. Removing one falls back to the page&rsquo;s original
        gradient. Images stay in the Media Library after removal.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {visibleSlots.map((s) => (
          <SlotCard
            key={s.key}
            pageId={pageId}
            slot={s.key}
            label={s.label}
            hint={s.hint}
            image={slots[s.key] ?? null}
            onChanged={(m) => { onToast(m, 'success'); void load(); }}
            onError={(m) => onToast(m, 'error')}
          />
        ))}
      </div>
    </div>
  );
}

export default PageImagesTab;
