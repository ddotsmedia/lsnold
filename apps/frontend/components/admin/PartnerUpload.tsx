'use client';

import { useEffect, useRef, useState } from 'react';

export interface PartnerUploadProps {
  /** Receives the chosen file, or null plus a message when it was rejected. */
  onSelect: (file: File | null, error?: string) => void;
  /** Existing logo, shown until a new file is picked. */
  currentUrl?: string | null;
  maxSize?: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

/**
 * Picks a logo file and previews it. Deliberately does not upload: the partner
 * form submits the file alongside its other fields in one request, so a failed
 * save cannot leave an orphaned image in Cloudinary.
 */
export function PartnerUpload({ onSelect, currentUrl, maxSize = 5 * 1024 * 1024 }: PartnerUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A blob: URL stays allocated until it is revoked, so tidy up when the
  // preview changes or the component goes away.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const choose = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      const message = 'Logo must be an image file';
      setError(message); onSelect(null, message);
      return;
    }
    if (file.size > maxSize) {
      const message = `Logo must be ${formatBytes(maxSize)} or smaller`;
      setError(message); onSelect(null, message);
      return;
    }

    setError(null);
    setPreview((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(file); });
    onSelect(file);
  };

  const shown = preview ?? currentUrl ?? null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wider text-panel-body">Logo</p>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); choose(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
        role="button"
        tabIndex={0}
        aria-label="Choose a logo image"
        className={`flex h-32 cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed transition-colors ${
          dragging ? 'border-emerald-500 bg-emerald-500/10' : 'border-panel-line-2 bg-panel-sunken hover:border-panel-line-2'
        }`}
      >
        {shown ? (
          // White plate behind it: most logos are dark artwork on transparency,
          // which would be invisible against the dark admin panel.
          <div className="flex h-full w-full items-center justify-center bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shown} alt="Logo preview" className="max-h-full max-w-full object-contain" />
          </div>
        ) : (
          <div className="px-4 text-center">
            <p className="text-2xl" aria-hidden="true">⬆</p>
            <p className="mt-1 text-sm text-panel-body">Drop a logo here</p>
            <p className="mt-0.5 text-xs text-panel-muted">or click to browse · max {formatBytes(maxSize)}</p>
          </div>
        )}
      </div>

      {shown && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="text-xs text-emerald-400 underline hover:text-emerald-300"
        >
          Choose a different image
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => choose(e.target.files)}
      />

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

export default PartnerUpload;
