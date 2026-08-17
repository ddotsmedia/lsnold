'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';
import { useRealtimeEvent } from '../../lib/realtime';

/**
 * The bell in the admin header.
 *
 * New items arrive over the socket that already exists; the initial count comes
 * from one request on mount. There is no polling — if the socket is down the
 * count is simply as at page load, which is what it would have been anyway.
 */

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string | null;
  related_id: string | null;
  action_url: string | null;
  read_at: string | null;
  created_at: string;
}

/** Rough relative time. Precise enough for a dropdown, and no dependency. */
function ago(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Only a path within the panel is followed. action_url is constrained by a
 * CHECK in the database too; this is the second of the two, because a value
 * that reaches an href is worth refusing in both places.
 */
function safeHref(url: string | null): string | null {
  return url && /^\/[a-zA-Z0-9/_?=&.-]*$/.test(url) ? url : null;
}

export function NotificationCenter() {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<{ notifications: Notification[]; unread: number }>(
        '/admin/notifications', { params: { limit: 5 } }
      );
      setItems(res.notifications);
      setUnread(res.unread);
    } catch {
      // The bell is decoration on a working panel.
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Pushed from the server when something arrives for this account.
  useRealtimeEvent<Notification>('notification:created', (incoming) => {
    setItems((current) =>
      current.some((n) => n.id === incoming.id) ? current : [incoming, ...current].slice(0, 5)
    );
    setUnread((n) => n + 1);
  });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const markRead = async (notification: Notification) => {
    if (notification.read_at) return;
    // Updated on screen first: the count should not wait on the network.
    setItems((current) =>
      current.map((n) => (n.id === notification.id ? { ...n, read_at: new Date().toISOString() } : n))
    );
    setUnread((n) => Math.max(0, n - 1));
    try {
      await api(`/admin/notifications/${notification.id}/read`, { method: 'PUT' });
    } catch {
      void load(); // Put the real state back if that failed.
    }
  };

  const markAll = async () => {
    setUnread(0);
    setItems((current) => current.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    try {
      await api('/admin/notifications/mark-all-read', { method: 'POST' });
    } catch {
      void load();
    }
  };

  return (
    <div className="relative" ref={wrapper}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        className="relative flex min-h-12 min-w-12 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
      >
        <span aria-hidden="true" className="text-lg">🔔</span>
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1 w-80 overflow-hidden rounded-xl border border-zinc-800 bg-[#111119] shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-zinc-800/50 px-4 py-2">
            <span className="text-sm font-medium text-zinc-200">Notifications</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => void markAll()}
                className="text-[11px] text-emerald-400 hover:text-emerald-300"
              >
                Mark all read
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-zinc-500">Nothing yet.</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {items.map((item) => {
                const href = safeHref(item.action_url);
                const body = (
                  <>
                    <span className="flex items-start gap-2">
                      {!item.read_at && (
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
                      )}
                      <span className="flex-1">
                        <span className="block text-sm text-zinc-200">{item.title}</span>
                        {item.message && (
                          <span className="block text-xs text-zinc-500">{item.message}</span>
                        )}
                        <span className="mt-0.5 block text-[11px] text-zinc-600">{ago(item.created_at)}</span>
                      </span>
                    </span>
                  </>
                );

                return (
                  <li key={item.id} className="border-b border-zinc-800/30 last:border-0">
                    {href ? (
                      <Link
                        href={href}
                        onClick={() => { void markRead(item); setOpen(false); }}
                        className="block px-4 py-3 transition-colors hover:bg-zinc-800/40"
                      >
                        {body}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void markRead(item)}
                        className="block w-full px-4 py-3 text-left transition-colors hover:bg-zinc-800/40"
                      >
                        {body}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <Link
            href="/admin/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-zinc-800/50 px-4 py-2.5 text-center text-xs text-zinc-400 transition-colors hover:bg-zinc-800/40 hover:text-zinc-200"
          >
            View all
          </Link>
        </div>
      )}
    </div>
  );
}
