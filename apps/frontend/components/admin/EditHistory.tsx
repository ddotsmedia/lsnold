'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';

/**
 * Who changed a section, and when.
 *
 * Collapsed by default and fetched on first open: most visits to the editor
 * are to change something, not to audit it, and a request per section on
 * mount would be one per card on the page.
 */

interface HistoryEntry {
  id: string;
  action: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
  admin_name: string | null;
  admin_email: string | null;
}

/** "2 hours ago". Falls back to a date once it stops being useful as elapsed. */
function ago(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days <= 14) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

/** The keys that actually differ, so "edited Title" names what changed. */
function changedKeys(entry: HistoryEntry): string[] {
  const before = entry.old_values ?? {};
  const after = entry.new_values ?? {};
  return Object.keys(after).filter(
    (k) => JSON.stringify(before[k]) !== JSON.stringify(after[k])
  );
}

const LABELS: Record<string, string> = {
  title: 'Title',
  content: 'Content',
  is_visible: 'Visibility',
  published_at: 'Publish date',
  scheduled_publish_at: 'Schedule',
  sort_order: 'Order',
  section_key: 'Section key',
};

function describe(entry: HistoryEntry): string {
  const who = entry.admin_name ?? entry.admin_email ?? 'Someone';
  if (entry.action !== 'update') return `${who} ${entry.action}d this section`;

  const keys = changedKeys(entry).map((k) => LABELS[k] ?? k);
  if (keys.length === 0) return `${who} saved this section`;
  if (keys.length === 1) return `${who} edited ${keys[0]}`;
  return `${who} edited ${keys.slice(0, -1).join(', ')} and ${keys[keys.length - 1]}`;
}

/** Long HTML in a diff line is noise; enough to recognise, not to read. */
function preview(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'shown' : 'hidden';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const plain = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return plain.length > 90 ? `${plain.slice(0, 90)}…` : plain || '—';
}

export function EditHistory({
  pageId,
  sectionId,
  /** Bumping this refetches — the editor raises it after a save. */
  refreshKey = 0,
}: {
  pageId: string;
  sectionId: string;
  refreshKey?: number;
}) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      setEntries(await api<HistoryEntry[]>(`/admin/pages/${pageId}/content/${sectionId}/history`));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [pageId, sectionId]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load, refreshKey]);

  return (
    <div className="mt-4 border-t border-panel-line/50 pt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-8 items-center gap-1.5 text-xs text-panel-muted transition-colors hover:text-panel-body"
      >
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        Edit history
      </button>

      {open && (
        <div className="mt-2">
          {loading && <p className="text-xs text-panel-faint">Loading…</p>}
          {failed && <p className="text-xs text-amber-400">Could not load the history.</p>}
          {!loading && !failed && entries?.length === 0 && (
            <p className="text-xs text-panel-faint">No changes recorded yet.</p>
          )}

          {entries && entries.length > 0 && (
            <ol className="space-y-1.5">
              {entries.map((entry) => {
                const keys = changedKeys(entry);
                const canExpand = keys.length > 0;
                const isOpen = expanded === entry.id;

                return (
                  <li key={entry.id} className="text-xs">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-panel-body">{describe(entry)}</span>
                      <span className="text-panel-faint">{ago(entry.created_at)}</span>
                      {canExpand && (
                        <button
                          type="button"
                          onClick={() => setExpanded(isOpen ? null : entry.id)}
                          aria-expanded={isOpen}
                          className="text-emerald-400 transition-colors hover:text-emerald-300"
                        >
                          {isOpen ? 'hide' : 'what changed'}
                        </button>
                      )}
                    </div>

                    {isOpen && (
                      <dl className="mt-1 space-y-1 rounded-md bg-panel-sunken p-2">
                        {keys.map((k) => (
                          <div key={k}>
                            <dt className="text-[11px] uppercase tracking-wider text-panel-faint">
                              {LABELS[k] ?? k}
                            </dt>
                            <dd className="text-panel-muted">
                              <span className="line-through">{preview(entry.old_values?.[k])}</span>
                              {' → '}
                              <span className="text-panel-body">{preview(entry.new_values?.[k])}</span>
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

export default EditHistory;
