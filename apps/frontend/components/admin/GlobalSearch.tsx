'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';

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

  const results = data?.results ?? [];

  const go = (result: Result) => {
    setOpen(false);
    router.push(result.url);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted((i) => Math.min(i + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted((i) => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && results[highlighted]) { e.preventDefault(); go(results[highlighted]); }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-12 items-center gap-2 rounded-lg border border-zinc-800 bg-[#0c0c14] px-3 text-sm text-zinc-500 transition-colors hover:border-zinc-700 hover:text-zinc-300"
      >
        <span aria-hidden="true">⌕</span>
        <span className="hidden sm:inline">Search</span>
        <kbd className="hidden rounded border border-zinc-700 px-1.5 text-[10px] sm:inline">⌘K</kbd>
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
        className="relative w-full max-w-xl overflow-hidden rounded-xl border border-zinc-800 bg-[#111119] shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-zinc-800/50 px-4">
          <span className="text-zinc-600" aria-hidden="true">⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search bookings, registrations, pages…"
            className="min-h-14 flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none"
          />
          {loading && <span className="text-[11px] text-zinc-600">searching…</span>}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {query.trim().length < 2 ? (
            <p className="px-4 py-8 text-center text-sm text-zinc-600">
              Type at least two characters.
            </p>
          ) : results.length === 0 && !loading ? (
            <p className="px-4 py-8 text-center text-sm text-zinc-600">
              Nothing matches “{query}”.
            </p>
          ) : (
            <ul>
              {results.map((result, index) => (
                <li key={`${result.type}-${result.id}`}>
                  <button
                    type="button"
                    onClick={() => go(result)}
                    onMouseEnter={() => setHighlighted(index)}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      index === highlighted ? 'bg-zinc-800/60' : 'hover:bg-zinc-800/30'
                    }`}
                  >
                    <span className="w-24 shrink-0 text-[11px] uppercase tracking-wider text-zinc-600">
                      {TYPE_LABELS[result.type] ?? result.type}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-zinc-200">{result.title}</span>
                      {result.subtitle && (
                        <span className="block truncate text-xs text-zinc-500">{result.subtitle}</span>
                      )}
                    </span>
                    {result.badge && (
                      <span className="shrink-0 rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-400">
                        {result.badge}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {data && data.total > 0 && (
          <div className="flex items-center justify-between border-t border-zinc-800/50 px-4 py-2 text-[11px] text-zinc-600">
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
