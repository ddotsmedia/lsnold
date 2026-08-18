'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../../lib/api';
import { Button, Modal } from './shared';

/**
 * Reordering and hiding dashboard widgets.
 *
 * Drag uses the native HTML5 API, with ▲/▼ buttons beside it. Not
 * react-beautiful-dnd: it is deprecated, its peer range stops at React 18 and
 * this project is on React 19. The arrows are not a consolation prize either —
 * native drag produces no events from touch, so on a phone they are the only
 * way to reorder, and they are the only way with a keyboard.
 */

export interface Widget {
  key: string;
  title: string;
  render: () => ReactNode;
}

interface Preferences {
  widget_order: string[];
  hidden_widgets: string[];
  theme: 'light' | 'dark' | 'system';
}

/**
 * Applies a saved order to the widgets the code currently defines.
 *
 * Keys that no longer exist are dropped and new ones are appended, so adding or
 * retiring a widget never strands somebody on a stale layout.
 */
function arrange(widgets: Widget[], order: string[]): Widget[] {
  const known = new Map(widgets.map((w) => [w.key, w]));
  const ordered = order.map((key) => known.get(key)).filter((w): w is Widget => Boolean(w));
  const seen = new Set(ordered.map((w) => w.key));
  return [...ordered, ...widgets.filter((w) => !seen.has(w.key))];
}

export function DashboardWidgets({ widgets }: { widgets: Widget[] }) {
  const [order, setOrder] = useState<string[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [customising, setCustomising] = useState(false);
  // Off by default: the handles are clutter above every chart when nobody is
  // rearranging, and a stray drag on a normal visit should not move anything.
  const [editing, setEditing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const dragFrom = useRef<number | null>(null);

  // Preferences are a convenience: if the request fails the dashboard still
  // renders in its default arrangement rather than showing an error.
  useEffect(() => {
    let cancelled = false;
    api<Preferences>('/admin/dashboard-preferences')
      .then((prefs) => {
        if (cancelled) return;
        setOrder(prefs.widget_order ?? []);
        setHidden(new Set(prefs.hidden_widgets ?? []));
      })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  const persist = useCallback(async (nextOrder: string[], nextHidden: Set<string>) => {
    try {
      await api('/admin/dashboard-preferences', {
        method: 'PUT',
        body: JSON.stringify({
          widget_order: nextOrder,
          hidden_widgets: [...nextHidden],
          // Owned by next-themes on the client; sent as-is so saving a layout
          // cannot silently change someone's theme.
          theme: (document.documentElement.dataset.theme as Preferences['theme']) ?? 'dark',
        }),
      });
    } catch {
      // Losing a layout preference is not worth interrupting anyone over.
    }
  }, []);

  const arranged = arrange(widgets, order);
  const visible = arranged.filter((w) => !hidden.has(w.key));

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= visible.length) return;
    const next = [...visible];
    const [moved] = next.splice(from, 1);
    if (moved) next.splice(to, 0, moved);
    // Hidden widgets keep their place in the saved order so unhiding one puts
    // it back where it was rather than at the end.
    const nextOrder = arrange(widgets, [...next.map((w) => w.key), ...order]).map((w) => w.key);
    setOrder(nextOrder);
    void persist(nextOrder, hidden);
  };

  const toggleHidden = (key: string) => {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key); else next.add(key);
    setHidden(next);
    void persist(order.length > 0 ? order : arranged.map((w) => w.key), next);
  };

  /**
   * Back to the order the code declares, with nothing hidden.
   *
   * Saved as empty rather than as the current default order: storing today's
   * default would freeze it, so a widget added later would land at the end
   * instead of where the code puts it.
   */
  const resetToDefault = () => {
    setOrder([]);
    setHidden(new Set());
    void persist([], new Set());
  };

  // Waits for the saved order before painting, so widgets do not visibly jump
  // from the default arrangement into the saved one.
  if (!loaded) {
    return <div className="h-96 animate-pulse rounded-xl bg-panel-raised/40" />;
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {editing && (
          <p className="mr-auto text-xs text-panel-muted">
            Drag a widget, or use the arrows, to change the order. Changes save as you make them.
          </p>
        )}
        {editing && (
          <Button variant="secondary" size="sm" onClick={() => setCustomising(true)}>
            Show or hide
          </Button>
        )}
        <Button
          variant={editing ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? 'Done' : '✎ Edit layout'}
        </Button>
      </div>

      <div className="space-y-8">
        {visible.map((widget, index) => (
          <div
            key={widget.key}
            draggable={editing}
            onDragStart={() => { dragFrom.current = index; }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const from = dragFrom.current;
              dragFrom.current = null;
              if (from !== null) move(from, index);
            }}
            onDragEnd={() => { dragFrom.current = null; }}
            className="group relative"
          >
            {/* Only while editing: above the widget, never covering a chart. */}
            {editing && (
            <div className="mb-1 flex items-center gap-1">
              <span className="cursor-grab select-none text-panel-faint" aria-hidden="true">⠿</span>
              <button
                type="button"
                onClick={() => move(index, index - 1)}
                disabled={index === 0}
                aria-label={`Move ${widget.title} up`}
                className="flex min-h-12 min-w-12 items-center justify-center rounded text-panel-muted hover:bg-panel-raised hover:text-panel-strong disabled:opacity-30"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => move(index, index + 1)}
                disabled={index === visible.length - 1}
                aria-label={`Move ${widget.title} down`}
                className="flex min-h-12 min-w-12 items-center justify-center rounded text-panel-muted hover:bg-panel-raised hover:text-panel-strong disabled:opacity-30"
              >
                ▼
              </button>
              <span className="text-[11px] text-panel-faint">{widget.title}</span>
            </div>
            )}
            {widget.render()}
          </div>
        ))}
      </div>

      <Modal open={customising} onClose={() => setCustomising(false)} title="Customise dashboard">
        <div className="space-y-2">
          <p className="text-xs text-panel-muted">
            Choose what appears. Hiding a widget keeps its position for when you bring it back.
          </p>
          {arranged.map((widget) => (
            <label
              key={widget.key}
              className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-panel-raised/40"
            >
              <input
                type="checkbox"
                checked={!hidden.has(widget.key)}
                onChange={() => toggleHidden(widget.key)}
                className="h-4 w-4 accent-emerald-500"
              />
              <span className="text-sm text-panel-strong">{widget.title}</span>
            </label>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-panel-line/50 pt-4">
            <Button
              variant="ghost"
              onClick={resetToDefault}
              // Nothing to undo when the layout is already the default one.
              disabled={order.length === 0 && hidden.size === 0}
            >
              Reset to default
            </Button>
            <Button onClick={() => setCustomising(false)}>Done</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
