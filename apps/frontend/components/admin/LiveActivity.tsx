'use client';

import { useEffect, useState } from 'react';
import { useRealtimeEvent } from '../../lib/realtime';

/**
 * Admin actions as they happen.
 *
 * The payload is deliberately thin — what changed and to what, never the before
 * and after values, since those can carry a family's contact details and this
 * room is gated on view:users rather than on the permission for the entity
 * touched. Anyone who needs the detail opens the activity log.
 *
 * Starts empty rather than backfilling: this is a live feed, and the log page
 * already answers "what happened earlier".
 */

export interface LiveEntry {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
  actor_name: string | null;
}

const ACTION_WORDS: Record<string, string> = {
  create: 'created',
  update: 'updated',
  delete: 'deleted',
  restore: 'restored',
  status_change: 'changed the status of',
  invite: 'invited',
  upload: 'uploaded',
  ask: 'asked the assistant about',
};

function readableType(type: string): string {
  return type.replace(/_/g, ' ');
}

export function LiveActivity({ max = 8 }: { max?: number }) {
  const [entries, setEntries] = useState<LiveEntry[]>([]);
  // Marks the newest row so it can fade in without animating the whole list
  // every time something arrives.
  const [newestId, setNewestId] = useState<string | null>(null);

  const connected = useRealtimeEvent<LiveEntry>('activity:log', (entry) => {
    setEntries((prev) => {
      // The same action can arrive twice if a socket reconnects mid-write.
      if (prev.some((e) => e.id === entry.id)) return prev;
      return [entry, ...prev].slice(0, max);
    });
    setNewestId(entry.id);
  });

  useEffect(() => {
    if (!newestId) return;
    const t = setTimeout(() => setNewestId(null), 1200);
    return () => clearTimeout(t);
  }, [newestId]);

  return (
    <section className="rounded-xl border border-zinc-800/50 bg-[#111119] p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-300">Live activity</h3>
        <span className="flex items-center gap-1.5 text-[11px] text-zinc-500">
          <span
            className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-zinc-600'}`}
            aria-hidden="true"
          />
          {connected ? 'Connected' : 'Offline'}
        </span>
      </div>

      {entries.length === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-600">
          {connected
            ? 'Watching. Anything an admin does will appear here.'
            : 'Not connected — the feed will fill once the connection is up.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className={`flex items-baseline gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors duration-700 ${
                entry.id === newestId ? 'bg-emerald-500/10' : ''
              }`}
            >
              <span className="text-zinc-300">
                {entry.actor_name ?? 'Someone'}{' '}
                <span className="text-zinc-500">
                  {ACTION_WORDS[entry.action] ?? entry.action}
                </span>{' '}
                a {readableType(entry.entity_type)}
              </span>
              <time
                dateTime={entry.created_at}
                className="ml-auto shrink-0 text-[11px] tabular-nums text-zinc-600"
              >
                {new Date(entry.created_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
