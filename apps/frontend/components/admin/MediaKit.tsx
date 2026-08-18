'use client';

/**
 * Reusable pieces of the media manager: ImageUploader, ImageGallery and
 * MediaLibrary.
 *
 * Drag & drop and drag-to-reorder use the browser's own HTML5 drag events
 * rather than react-dropzone / react-beautiful-dnd. react-beautiful-dnd is
 * unmaintained and does not support React 19, which this app runs, and the
 * native API covers both cases in far less code than a dependency would cost.
 */

import { useCallback, useRef, useState } from 'react';
import { Button } from './shared';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

export interface MediaItem {
  id: string;
  title: string;
  url: string;
  alt_text: string | null;
  description?: string | null;
  width: number | null;
  height: number | null;
  file_size: number | null;
  mime_type?: string | null;
  category?: string;
  created_at?: string;
  /** Present when the item came back as an assignment rather than a bare image. */
  assignment_id?: string;
}

export type MediaCategory = 'site' | 'age-groups' | 'pages';

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * XHR rather than fetch: fetch cannot report upload progress, and a progress
 * bar is the whole point of showing one during a multi-megabyte upload.
 */
function uploadWithProgress(
  file: File,
  category: MediaCategory,
  onProgress: (percent: number) => void
): Promise<MediaItem> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);
    form.append('category', category);
    form.append('title', file.name.replace(/\.[^.]+$/, ''));

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/admin/media/upload`);

    const token = typeof window !== 'undefined' ? localStorage.getItem('lsn_token') : null;
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };

    xhr.onload = () => {
      let body: unknown = null;
      try { body = JSON.parse(xhr.responseText); } catch { /* non-JSON error page */ }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as MediaItem);
      } else {
        reject(new Error((body as { error?: string })?.error || `Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(form);
  });
}

const MAX_BYTES = 10 * 1024 * 1024;

/* ------------------------------------------------------------ ImageUploader */

export interface ImageUploaderProps {
  onUpload: (items: MediaItem[]) => void | Promise<void>;
  category: MediaCategory;
  /** Current image shown in place of the drop zone. */
  preview?: string | null;
  previewAlt?: string;
  multiple?: boolean;
  maxSize?: number;
  label?: string;
  /** Compact variant for the small single-slot tiles. */
  compact?: boolean;
  onRemove?: () => void;
}

export function ImageUploader({
  onUpload,
  category,
  preview,
  previewAlt = '',
  multiple = false,
  maxSize = MAX_BYTES,
  label,
  compact = false,
  onRemove,
}: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const chosen = multiple ? Array.from(files) : [files[0] as File];

      for (const file of chosen) {
        if (!file.type.startsWith('image/')) {
          setError(`${file.name} is not an image`);
          return;
        }
        if (file.size > maxSize) {
          setError(`${file.name} is larger than ${formatBytes(maxSize)}`);
          return;
        }
      }

      setError(null);
      setBusy(true);
      setProgress(0);
      const uploaded: MediaItem[] = [];
      try {
        for (let i = 0; i < chosen.length; i++) {
          const file = chosen[i] as File;
          const item = await uploadWithProgress(file, category, (p) => {
            // Across a batch, show overall progress rather than per-file.
            setProgress(Math.round(((i + p / 100) / chosen.length) * 100));
          });
          uploaded.push(item);
        }
        await onUpload(uploaded);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed');
      } finally {
        setBusy(false);
        setProgress(0);
        if (inputRef.current) inputRef.current.value = '';
      }
    },
    [category, maxSize, multiple, onUpload]
  );

  return (
    <div className="space-y-2">
      {label && <p className="text-xs font-medium uppercase tracking-wider text-panel-body">{label}</p>}

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); void handleFiles(e.dataTransfer.files); }}
        onClick={() => !busy && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
        className={`relative flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed transition-colors ${
          compact ? 'h-32' : 'h-44'
        } ${
          dragging
            ? 'border-emerald-500 bg-emerald-500/10'
            : 'border-panel-line-2 bg-panel-sunken hover:border-panel-line-2'
        }`}
      >
        {preview && !busy ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt={previewAlt} className="h-full w-full object-cover" />
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 opacity-0 transition-opacity hover:opacity-100">
              <span className="rounded-lg bg-panel-surface/90 px-3 py-1.5 text-xs text-panel-strong">Replace</span>
              {onRemove && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onRemove(); }}
                  className="rounded-lg bg-red-500/20 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/30"
                >
                  Remove
                </button>
              )}
            </div>
          </>
        ) : busy ? (
          <div className="w-full px-6 text-center">
            <p className="mb-2 text-sm text-panel-body">Uploading… {progress}%</p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-panel-raised">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="px-4 text-center">
            <p className="text-2xl" aria-hidden="true">⬆</p>
            <p className="mt-1 text-sm text-panel-body">
              Drop {multiple ? 'images' : 'an image'} here
            </p>
            <p className="mt-0.5 text-xs text-panel-muted">or click to browse · max {formatBytes(maxSize)}</p>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

/* ------------------------------------------------------------ ImageGallery */

export interface ImageGalleryProps {
  images: MediaItem[];
  onDelete: (item: MediaItem) => void;
  /** Receives assignment ids in their new order. */
  onReorder?: (orderedAssignmentIds: string[]) => void;
}

export function ImageGallery({ images, onDelete, onReorder }: ImageGalleryProps) {
  // The source index lives in a ref as well as state: drop has to read it, and
  // a drag can start and finish before React has re-rendered, which would leave
  // the state copy still null. State is only for the visual feedback.
  const dragRef = useRef<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  if (images.length === 0) {
    return <p className="text-sm text-panel-muted">No images yet.</p>;
  }

  const commit = (from: number, to: number) => {
    if (!onReorder || from === to) return;
    const next = [...images];
    const [moved] = next.splice(from, 1);
    if (moved) next.splice(to, 0, moved);
    onReorder(next.map((i) => i.assignment_id ?? i.id));
  };

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {images.map((image, index) => (
        <figure
          key={image.assignment_id ?? image.id}
          draggable={Boolean(onReorder)}
          onDragStart={() => { dragRef.current = index; setDragIndex(index); }}
          onDragOver={(e) => { e.preventDefault(); setOverIndex(index); }}
          onDragEnd={() => { dragRef.current = null; setDragIndex(null); setOverIndex(null); }}
          onDrop={(e) => {
            e.preventDefault();
            const from = dragRef.current;
            if (from !== null) commit(from, index);
            dragRef.current = null;
            setDragIndex(null);
            setOverIndex(null);
          }}
          className={`group relative overflow-hidden rounded-lg border bg-panel-sunken transition-all ${
            overIndex === index && dragIndex !== index
              ? 'border-emerald-500 ring-2 ring-emerald-500/40'
              : 'border-panel-line'
          } ${dragIndex === index ? 'opacity-40' : ''} ${onReorder ? 'cursor-move' : ''}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.url} alt={image.alt_text ?? ''} className="aspect-4/3 w-full object-cover" />

          <button
            type="button"
            onClick={() => onDelete(image)}
            aria-label={`Remove ${image.title}`}
            className="absolute right-2 top-2 rounded-lg bg-red-500/80 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
          >
            ×
          </button>

          <figcaption className="truncate px-2 py-1.5 text-xs text-panel-body" title={image.alt_text ?? ''}>
            {image.alt_text || image.title}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ MediaLibrary */

export interface MediaLibraryProps {
  items: MediaItem[];
  loading?: boolean;
  onSelect?: (item: MediaItem) => void;
  selectedIds?: string[];
  onToggleSelect?: (id: string) => void;
  onEdit?: (item: MediaItem) => void;
  emptyMessage?: string;
}

export function MediaLibrary({
  items,
  loading,
  onSelect,
  selectedIds = [],
  onToggleSelect,
  onEdit,
  emptyMessage = 'No images yet. Upload one to get started.',
}: MediaLibraryProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="aspect-4/3 animate-pulse rounded-lg bg-panel-raised/50" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-panel-muted">{emptyMessage}</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => {
        const selected = selectedIds.includes(item.id);
        return (
          <div
            key={item.id}
            className={`group relative overflow-hidden rounded-xl border bg-panel-sunken transition-all ${
              selected ? 'border-emerald-500 ring-2 ring-emerald-500/40' : 'border-panel-line hover:border-panel-line-2'
            }`}
          >
            <button
              type="button"
              onClick={() => (onSelect ? onSelect(item) : onToggleSelect?.(item.id))}
              className="block w-full text-left"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.url} alt={item.alt_text ?? ''} className="aspect-4/3 w-full object-cover" />
            </button>

            {onToggleSelect && (
              <label className="absolute left-2 top-2 flex cursor-pointer items-center rounded bg-black/60 p-1">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onToggleSelect(item.id)}
                  aria-label={`Select ${item.title}`}
                  className="h-4 w-4 accent-emerald-500"
                />
              </label>
            )}

            <div className="space-y-1 p-3">
              <p className="truncate text-sm font-medium text-panel-strong" title={item.title}>{item.title}</p>
              <p className="truncate text-xs text-panel-muted" title={item.alt_text ?? ''}>
                {item.alt_text || <span className="text-amber-500">No alt text</span>}
              </p>
              <p className="text-xs text-panel-faint">
                {item.width && item.height ? `${item.width}×${item.height} · ` : ''}
                {formatBytes(item.file_size)}
                {item.created_at ? ` · ${new Date(item.created_at).toLocaleDateString()}` : ''}
              </p>
              {onEdit && (
                <Button size="sm" variant="secondary" onClick={() => onEdit(item)} className="mt-1 w-full">
                  Edit details
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
