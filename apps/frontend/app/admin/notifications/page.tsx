'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../../../lib/api';
import { useRealtimeEvent } from '../../../lib/realtime';
import { Button, Toast } from '../../../components/admin/shared';
import type { Notification } from '../../../components/admin/NotificationCenter';

/** The whole feed, with the same filters the bell summarises. */

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'booking_pending', label: 'Bookings' },
  { key: 'registration_pending', label: 'Registrations' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

function safeHref(url: string | null): string | null {
  return url && /^\/[a-zA-Z0-9/_?=&.-]*$/.test(url) ? url : null;
}

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ notifications: Notification[]; unread: number }>(
        '/admin/notifications',
        { params: { limit: 100, ...(filter === 'unread' ? { unread: 'true' } : {}) } }
      );
      setItems(res.notifications);
      setUnread(res.unread);
    } catch {
      setToast({ message: 'Could not load notifications', type: 'error' });
    } finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }
  }, [toast]);

  useRealtimeEvent<Notification>('notification:created', (incoming) => {
    setItems((current) => (current.some((n) => n.id === incoming.id) ? current : [incoming, ...current]));
    setUnread((n) => n + 1);
  });

  const markRead = async (item: Notification) => {
    if (item.read_at) return;
    setItems((c) => c.map((n) => (n.id === item.id ? { ...n, read_at: new Date().toISOString() } : n)));
    setUnread((n) => Math.max(0, n - 1));
    try { await api(`/admin/notifications/${item.id}/read`, { method: 'PUT' }); }
    catch { void load(); }
  };

  const dismiss = async (item: Notification) => {
    setItems((c) => c.filter((n) => n.id !== item.id));
    if (!item.read_at) setUnread((n) => Math.max(0, n - 1));
    try { await api(`/admin/notifications/${item.id}`, { method: 'DELETE' }); }
    catch { void load(); }
  };

  const markAll = async () => {
    setItems((c) => c.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    setUnread(0);
    try { await api('/admin/notifications/mark-all-read', { method: 'POST' }); }
    catch { void load(); }
  };

  // The type filters narrow client-side; the server already returned the set.
  const visible = filter === 'all' || filter === 'unread'
    ? items
    : items.filter((n) => n.type === filter);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium text-panel-strong">Notifications</h2>
          <p className="text-xs text-panel-muted">
            {unread > 0 ? `${unread} unread` : 'Nothing unread'}
          </p>
        </div>
        {unread > 0 && (
          <Button variant="secondary" onClick={() => void markAll()}>Mark all read</Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`min-h-12 rounded-lg border px-4 text-sm transition-colors ${
              filter === f.key
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                : 'border-panel-line text-panel-body hover:bg-panel-raised/40'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-panel-raised/40" />)}
        </div>
      ) : visible.length === 0 ? (
        <p className="rounded-xl border border-panel-line/50 bg-panel-surface p-10 text-center text-sm text-panel-muted">
          Nothing here.
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((item) => {
            const href = safeHref(item.action_url);
            return (
              <li
                key={item.id}
                className={`flex items-start gap-3 rounded-xl border p-4 ${
                  item.read_at
                    ? 'border-panel-line/50 bg-panel-surface'
                    : 'border-emerald-500/20 bg-emerald-500/5'
                }`}
              >
                {!item.read_at && (
                  <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-panel-strong">{item.title}</p>
                  {item.message && <p className="text-xs text-panel-muted">{item.message}</p>}
                  <p className="mt-1 text-[11px] text-panel-faint">
                    {new Date(item.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1">
                  {href && (
                    <Link
                      href={href}
                      onClick={() => void markRead(item)}
                      className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-lg border border-panel-line-2 bg-panel-raised/50 px-3 text-xs text-panel-body hover:bg-panel-raised"
                    >
                      Open
                    </Link>
                  )}
                  {!item.read_at && (
                    <Button size="sm" variant="ghost" onClick={() => void markRead(item)}>Read</Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => void dismiss(item)} aria-label="Dismiss">
                    ×
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}
