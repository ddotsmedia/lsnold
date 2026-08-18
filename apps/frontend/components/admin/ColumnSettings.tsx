'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Chooses which columns a table shows.
 *
 * Kept per table and per browser rather than per account: it is a view
 * preference, not data, and syncing it to the server would mean a round trip
 * before the first paint just to know which headers to draw.
 *
 * A stored list can outlive the table it came from — a column gets renamed or
 * dropped between deploys — so the caller reconciles what it reads against the
 * columns that exist today rather than trusting it.
 */

export interface ColumnToggle {
  key: string;
  header: string;
  /** Columns the table cannot usefully be read without. */
  locked?: boolean;
}

export function storageKeyFor(table: string): string {
  return `lsn_columns_${table}`;
}

/** Reads the stored choice, keeping only keys that still exist. */
export function readVisible(table: string, columns: ColumnToggle[]): Set<string> {
  const all = new Set(columns.map((c) => c.key));
  try {
    const raw = localStorage.getItem(storageKeyFor(table));
    if (raw) {
      const saved = JSON.parse(raw) as string[];
      if (Array.isArray(saved)) {
        const kept = saved.filter((k) => all.has(k));
        // A stored list that no longer matches anything would hide the whole
        // table; fall back to showing everything instead.
        if (kept.length > 0) {
          for (const col of columns) if (col.locked) kept.push(col.key);
          return new Set(kept);
        }
      }
    }
  } catch { /* unparseable or storage unavailable */ }
  return all;
}

export function ColumnSettings({
  table,
  columns,
  visible,
  onChange,
}: {
  /** Names the stored preference; must be stable across deploys. */
  table: string;
  columns: ColumnToggle[];
  visible: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const persist = (next: Set<string>) => {
    onChange(next);
    try {
      localStorage.setItem(storageKeyFor(table), JSON.stringify([...next]));
    } catch { /* private mode, quota — the choice still applies this session */ }
  };

  const toggle = (key: string, locked?: boolean) => {
    if (locked) return;
    const next = new Set(visible);
    // Never let the last column be hidden; an empty table cannot be recovered
    // from without clearing storage by hand.
    if (next.has(key) && next.size > 1) next.delete(key);
    else next.add(key);
    persist(next);
  };

  const hiddenCount = columns.length - visible.size;

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Choose columns${hiddenCount > 0 ? `, ${hiddenCount} hidden` : ''}`}
        className="flex min-h-12 items-center gap-2 rounded-lg border border-panel-line bg-panel-sunken px-3 text-sm text-panel-body transition-colors hover:border-panel-line-2 hover:text-panel-strong"
      >
        <span aria-hidden="true">▦</span>
        <span className="hidden sm:inline">Columns</span>
        {hiddenCount > 0 && (
          <span className="rounded-full bg-emerald-500/20 px-1.5 text-[10px] text-emerald-400">
            {hiddenCount} hidden
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 w-60 rounded-lg border border-panel-line bg-panel-surface p-2 shadow-xl">
          <p className="px-2 py-1 text-[11px] uppercase tracking-wider text-panel-faint">
            Show columns
          </p>
          <ul className="max-h-72 overflow-y-auto">
            {columns.map((col) => (
              <li key={col.key}>
                <label
                  className={`flex min-h-11 items-center gap-2 rounded px-2 text-sm ${
                    col.locked
                      ? 'cursor-not-allowed text-panel-faint'
                      : 'cursor-pointer text-panel-body hover:bg-panel-raised/40'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={visible.has(col.key)}
                    disabled={col.locked}
                    onChange={() => toggle(col.key, col.locked)}
                    className="h-4 w-4 accent-emerald-500"
                  />
                  <span className="flex-1 truncate">{col.header}</span>
                  {col.locked && <span className="text-[10px]">always</span>}
                </label>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => persist(new Set(columns.map((c) => c.key)))}
            className="mt-1 w-full rounded px-2 py-1.5 text-left text-xs text-panel-muted hover:bg-panel-raised/40 hover:text-panel-body"
          >
            Show all
          </button>
        </div>
      )}
    </div>
  );
}
