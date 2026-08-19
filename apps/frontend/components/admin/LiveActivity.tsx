'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRealtimeEvent } from '../../lib/realtime';
import { feedItem } from '../../lib/animations';

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
  /** Set for arrivals from the public forms, which read differently. */
  submission?: boolean;
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

/** A booking or registration row, as broadcast to its own room. */
interface SubmissionPayload {
  id: string;
  visitor_name?: string;
  child_name?: string;
  created_at?: string;
}

export function LiveActivity({ max = 8 }: { max?: number }) {
  const [entries, setEntries] = useState<LiveEntry[]>([]);
  // Marks the newest row so it can fade in without animating the whole list
  // every time something arrives.
  const [newestId, setNewestId] = useState<string | null>(null);

  const add = (entry: LiveEntry) => {
    setEntries((prev) => {
      // The same action can arrive twice if a socket reconnects mid-write.
      if (prev.some((e) => e.id === entry.id)) return prev;
      return [entry, ...prev].slice(0, max);
    });
    setNewestId(entry.id);
  };

  const connected = useRealtimeEvent<LiveEntry>('activity:log', add);

  /**
   * Arrivals from the public forms, named.
   *
   * A name is shown here and not on the activity feed above because these come
   * from the bookings and registrations rooms, which a socket only joins after
   * proving it holds view:bookings or view:registrations. Anyone receiving this
   * is already entitled to open the record. The activity room is gated on
   * view:users instead, which is a different entitlement, so its payload stays
   * thin.
   */
  useRealtimeEvent<SubmissionPayload>('booking:created', (row) => {
    add({
      id: `booking-${row.id}`,
      action: 'create',
      entity_type: 'tour booking',
      submission: true,
      entity_id: row.id,
      created_at: row.created_at ?? new Date().toISOString(),
      actor_name: row.visitor_name ?? null,
    });
  });

  useRealtimeEvent<SubmissionPayload>('registration:created', (row) => {
    add({
      id: `registration-${row.id}`,
      action: 'create',
      entity_type: 'registration',
      submission: true,
      entity_id: row.id,
      created_at: row.created_at ?? new Date().toISOString(),
      actor_name: row.child_name ?? null,
    });
  });

  useEffect(() => {
    if (!newestId) return;
    const t = setTimeout(() => setNewestId(null), 1200);
    return () => clearTimeout(t);
  }, [newestId]);

  return (
    <section className="rounded-xl border border-panel-line/50 bg-panel-surface p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-panel-body">Live activity</h3>
        <span className="flex items-center gap-1.5 text-[11px] text-panel-muted">
          <span
            className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-panel-raised-2'}`}
            aria-hidden="true"
          />
          {connected ? 'Connected' : 'Offline'}
        </span>
      </div>

      {entries.length === 0 ? (
        <p className="py-6 text-center text-sm text-panel-faint">
          {connected
            ? 'Watching. Anything an admin does will appear here.'
            : 'Not connected — the feed will fill once the connection is up.'}
        </p>
      ) : (
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
          {entries.map((entry) => (
            <motion.li
              key={entry.id}
              variants={feedItem}
              initial="hidden" animate="visible" exit="exit"
              layout
              className={`flex items-baseline gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors duration-700 ${
                entry.id === newestId ? 'bg-emerald-500/10' : ''
              }`}
            >
              <span className="text-panel-body">
                {entry.submission ? (
                  <>
                    <span className="text-emerald-400">New {readableType(entry.entity_type)}</span>
                    {entry.actor_name ? <> from {entry.actor_name}</> : null}
                  </>
                ) : (
                  <>
                    {entry.actor_name ?? 'Someone'}{' '}
                    <span className="text-panel-muted">
                      {ACTION_WORDS[entry.action] ?? entry.action}
                    </span>{' '}
                    a {readableType(entry.entity_type)}
                  </>
                )}
              </span>
              <time
                dateTime={entry.created_at}
                className="ml-auto shrink-0 text-[11px] tabular-nums text-panel-faint"
              >
                {new Date(entry.created_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
            </motion.li>
          ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}
