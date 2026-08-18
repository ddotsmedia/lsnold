'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from './shared';
import { downloadExport, fetchDataset, exportToPDF } from '../../lib/export';

/**
 * Export in the three formats, from one button.
 *
 * Every format covers the whole filtered set, not the page on screen — the
 * current filters are passed through to the server, which is what an admin
 * means when they filter to "pending" and then export.
 */
export function ExportMenu({
  path,
  params,
  title,
  subtitle,
  onError,
}: {
  /** Export endpoint, e.g. /admin/registrations/export */
  path: string;
  /** Current filters, forwarded so the export matches what is on screen. */
  params: Record<string, string | undefined>;
  title: string;
  subtitle?: string;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);

  // Clicking anywhere else closes it, which is what a menu is expected to do.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const onEsc = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const run = async (format: 'csv' | 'xlsx' | 'pdf') => {
    setBusy(format);
    try {
      if (format === 'pdf') {
        const data = await fetchDataset(path, params);
        await exportToPDF(data, title, subtitle);
      } else {
        await downloadExport(path, params, format);
      }
      setOpen(false);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Export failed');
    } finally { setBusy(null); }
  };

  const items: Array<{ format: 'csv' | 'xlsx' | 'pdf'; label: string; hint: string }> = [
    { format: 'csv', label: 'CSV', hint: 'Opens in any spreadsheet' },
    { format: 'xlsx', label: 'Excel', hint: 'Formatted, with filters' },
    { format: 'pdf', label: 'PDF', hint: 'For printing or sending' },
  ];

  return (
    <div className="relative" ref={wrapper}>
      <Button
        variant="secondary"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy !== null}
      >
        {busy ? `Preparing ${busy.toUpperCase()}…` : 'Export ▾'}
      </Button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-lg border border-panel-line bg-panel-surface shadow-2xl"
        >
          {items.map((item) => (
            <button
              key={item.format}
              role="menuitem"
              onClick={() => void run(item.format)}
              disabled={busy !== null}
              className="flex min-h-12 w-full flex-col justify-center px-4 py-2 text-left transition-colors hover:bg-panel-raised disabled:opacity-50"
            >
              <span className="text-sm text-panel-strong">{item.label}</span>
              <span className="text-[11px] text-panel-muted">{item.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
