'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { matchCommands, type Command } from '../../lib/commands';

/**
 * Search across the panel, opened with Cmd+K or Ctrl+K.
 *
 * The server decides which types this account may search, so the palette shows
 * whatever comes back rather than assuming a fixed set — a viewer and an
 * administrator see different things through the same box.
 */

interface Result {
  type: string;
  id: string;
  title: string;
  subtitle: string;
  badge: string | null;
  url: string;
}

interface SearchResponse {
  query: string;
  results: Result[];
  total: number;
  types: Array<{ type: string; count: number }>;
  took_ms: number;
}

const TYPE_LABELS: Record<string, string> = {
  registrations: 'Registrations',
  bookings: 'Tour bookings',
  pages: 'Pages',
  sections: 'Page text',
  events: 'News & events',
  media: 'Media',
  users: 'Users',
};

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cmd+K on a Mac, Ctrl+K elsewhere. preventDefault stops the browser's own
  // search bar taking the shortcut.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) {
      // Focused after paint, or the browser may ignore it on a just-mounted node.
      const t = setTimeout(() => inputRef.current?.focus(), 20);
      return () => clearTimeout(t);
    }
    setQuery('');
    setData(null);
    setHighlighted(0);
  }, [open]);

  const run = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setData(null); return; }
    setLoading(true);
    try {
      setData(await api<SearchResponse>('/admin/search', { params: { q } }));
      setHighlighted(0);
    } catch {
      setData(null);
    } finally { setLoading(false); }
  }, []);

  // Debounced, so typing a name is one request rather than one per letter.
  useEffect(() => {
    const t = setTimeout(() => void run(query), 300);
    return () => clearTimeout(t);
  }, [query, run]);

  const { user } = useAuth();
  const allowed = useMemo(
    () => new Set<string>(user?.permissions ?? []),
    [user]
  );

  // Actions and destinations, filtered to what this account may reach.
  // Matched locally: they are a fixed list, so a round trip would only add
  // latency to the thing people press Cmd+K for most.
  const commands = useMemo(() => matchCommands(query, allowed), [query, allowed]);

  const searchResults = data?.results ?? [];
  // One flat list so ArrowDown runs through commands into search hits
  // without the cursor jumping between two separately-indexed sections.
  const rows: Array<{ kind: 'command'; item: Command } | { kind: 'result'; item: Result }> = [
    ...commands.map((item) => ({ kind: 'command' as const, item })),
    ...searchResults.map((item) => ({ kind: 'result' as const, item })),
  ];

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted((i) => Math.min(i + 1, rows.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted((i) => Math.max(i - 1, 0)); }
    if (e.key === 'Enter') {
      const row = rows[highlighted];
      if (row) { e.preventDefault(); go(row.kind === 'command' ? row.item.href : row.item.url); }
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-12 items-center gap-2 rounded-lg border border-panel-line bg-panel-sunken px-3 text-sm text-panel-muted transition-colors hover:border-panel-line-2 hover:text-panel-body"
      >
        <span aria-hidden="true">⌕</span>
        <span className="hidden sm:inline">Search</span>
        <kbd className="hidden rounded border border-panel-line-2 px-1.5 text-[10px] sm:inline">⌘K</kbd>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center p-4 pt-[10vh]">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="relative w-full max-w-xl overflow-hidden rounded-xl border border-panel-line bg-panel-surface shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-panel-line/50 px-4">
          <span className="text-panel-faint" aria-hidden="true">⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search bookings, registrations, pages…"
            className="min-h-14 flex-1 bg-transparent text-sm text-panel-strong placeholder-panel-faint focus:outline-none"
          />
          {loading && <span className="text-[11px] text-panel-faint">searching…</span>}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {rows.length === 0 && !loading ? (
            <p className="px-4 py-8 text-center text-sm text-panel-faint">
              {query.trim()
                ? `Nothing matches “${query}”.`
                : 'Type to search, or pick an action below.'}
            </p>
          ) : (
            /* Registration hits come back with the child's name as the title,
               and this palette opens on every admin route — so the results are
               kept out of session recordings wherever they are opened from.
               See components/admin/SessionRecording.tsx. */
            <ul data-hj-suppress>
              {rows.map((row, index) => {
                const highlightedRow = index === highlighted;
                const cls = `flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  highlightedRow ? 'bg-panel-raised/60' : 'hover:bg-panel-raised/30'
                }`;

                if (row.kind === 'command') {
                  return (
                    <li key={`cmd-${row.item.id}`}>
                      <button
                        type="button"
                        onClick={() => go(row.item.href)}
                        onMouseEnter={() => setHighlighted(index)}
                        className={cls}
                      >
                        <span className="w-24 shrink-0 text-[11px] uppercase tracking-wider text-panel-faint">
                          {row.item.group}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm text-panel-strong">
                          {row.item.label}
                        </span>
                        <span className="shrink-0 text-xs text-panel-faint" aria-hidden="true">↵</span>
                      </button>
                    </li>
                  );
                }

                const result = row.item;
                return (
                  <li key={`${result.type}-${result.id}`}>
                    <button
                      type="button"
                      onClick={() => go(result.url)}
                      onMouseEnter={() => setHighlighted(index)}
                      className={cls}
                    >
                      <span className="w-24 shrink-0 text-[11px] uppercase tracking-wider text-panel-faint">
                        {TYPE_LABELS[result.type] ?? result.type}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-panel-strong">{result.title}</span>
                        {result.subtitle && (
                          <span className="block truncate text-xs text-panel-muted">{result.subtitle}</span>
                        )}
                      </span>
                      {result.badge && (
                        <span className="shrink-0 rounded-full border border-panel-line-2 px-2 py-0.5 text-[10px] text-panel-body">
                          {result.badge}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {data && data.total > 0 && (
          <div className="flex items-center justify-between border-t border-panel-line/50 px-4 py-2 text-[11px] text-panel-faint">
            <span>
              {data.types.map((t) => `${TYPE_LABELS[t.type] ?? t.type} ${t.count}`).join(' · ')}
            </span>
            <span>{data.took_ms} ms</span>
          </div>
        )}
      </div>
    </div>
  );
}
