'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../../lib/api';
import {
  Button, Modal, FormField, Input, Textarea, Select, Toast, ConfirmDialog,
} from '../../../components/admin/shared';

/**
 * The card rows a page renders, edited here rather than in the page's own
 * screen because they belong to the page and not to any one record.
 *
 * The facilities page's Safety & Wellbeing row is the first group. Others can
 * be added by giving a card a new section key — the storage and this screen
 * are already general.
 */

interface FeatureCard {
  id: string;
  page_slug: string;
  section_key: string;
  title: string;
  description: string | null;
  icon: string | null;
  color: string;
  sort_order: number;
}

/**
 * The groups a page actually renders. A card written under some other section
 * key is stored but nothing displays it, so the admin only offers these.
 */
const GROUPS: { pageSlug: string; sectionKey: string; label: string; note: string }[] = [
  {
    pageSlug: 'facilities',
    sectionKey: 'facilities-safety',
    label: 'Facilities — Safety & Hygiene',
    note: 'The row of cards under the Safety & Hygiene Standards heading on /facilities.',
  },
];

const COLORS = [
  { value: 'blue', label: 'Blue' },
  { value: 'green', label: 'Green' },
  { value: 'red', label: 'Red' },
  { value: 'yellow', label: 'Yellow' },
  { value: 'purple', label: 'Purple' },
];

const EMPTY = { title: '', description: '', icon: '', color: 'blue' };

export default function FeatureCardsPage() {
  const [groupIndex, setGroupIndex] = useState(0);
  const group = GROUPS[groupIndex]!;

  const [cards, setCards] = useState<FeatureCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [confirmDelete, setConfirmDelete] = useState<FeatureCard | null>(null);

  const dragRef = useRef<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const ok = (message: string) => setToast({ message, type: 'success' });
  const fail = (message: string) => setToast({ message, type: 'error' });

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }
  }, [toast]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await api<FeatureCard[]>(`/admin/page-feature-cards/${group.pageSlug}`);
      setCards(rows.filter((c) => c.section_key === group.sectionKey));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load feature cards');
    } finally { setLoading(false); }
  }, [group.pageSlug, group.sectionKey]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!form.title.trim()) { fail('A title is required'); return; }
    try {
      const body = {
        section_key: group.sectionKey,
        title: form.title.trim(),
        description: form.description.trim() || null,
        icon: form.icon.trim() || null,
        color: form.color,
      };
      if (editId) {
        await api(`/admin/page-feature-cards/card/${editId}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await api(`/admin/page-feature-cards/${group.pageSlug}`, { method: 'POST', body: JSON.stringify(body) });
      }
      ok(`Card ${editId ? 'updated' : 'created'}`);
      setShowModal(false); setEditId(null); setForm(EMPTY);
      await load();
    } catch (err) { fail(err instanceof Error ? err.message : 'Failed to save'); }
  };

  const remove = async () => {
    if (!confirmDelete) return;
    const target = confirmDelete;
    setConfirmDelete(null);
    try {
      await api(`/admin/page-feature-cards/card/${target.id}`, { method: 'DELETE' });
      ok(`${target.title} deleted`);
      await load();
    } catch (err) { fail(err instanceof Error ? err.message : 'Failed to delete'); }
  };

  const commitOrder = async (from: number, to: number) => {
    if (from === to) return;
    const next = [...cards];
    const [moved] = next.splice(from, 1);
    if (moved) next.splice(to, 0, moved);
    setCards(next); // optimistic

    try {
      await api(`/admin/page-feature-cards/${group.pageSlug}/reorder`, {
        method: 'POST',
        body: JSON.stringify({ ids: next.map((c) => c.id) }),
      });
      ok('Order saved');
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Failed to save order');
      await load();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <FormField label="Card group">
            <Select
              options={GROUPS.map((g, i) => ({ value: String(i), label: g.label }))}
              value={String(groupIndex)}
              onChange={(e) => setGroupIndex(Number(e.target.value))}
            />
          </FormField>
          <p className="mt-2 text-xs text-panel-muted">{group.note}</p>
        </div>
        <Button onClick={() => { setEditId(null); setForm(EMPTY); setShowModal(true); }}>
          + New Card
        </Button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
          <p className="text-sm text-red-300">Could not load feature cards</p>
          <p className="mt-1 text-xs text-red-400/80">{error}</p>
          <Button variant="secondary" onClick={() => void load()} className="mt-3">Try again</Button>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-32 animate-pulse rounded-xl bg-panel-raised/40" />)}
        </div>
      ) : cards.length === 0 ? (
        <div className="rounded-xl border border-panel-line/50 bg-panel-surface p-8 text-center">
          <p className="text-sm text-panel-muted">
            No cards yet. The page falls back to the wording it ships with until one is added.
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-panel-muted">Drag to reorder. The page renders them in this order.</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {cards.map((card, index) => (
              <article
                key={card.id}
                draggable
                onDragStart={() => { dragRef.current = index; setDragIndex(index); }}
                onDragOver={(e) => { e.preventDefault(); setOverIndex(index); }}
                onDragEnd={() => { dragRef.current = null; setDragIndex(null); setOverIndex(null); }}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = dragRef.current;
                  if (from !== null) void commitOrder(from, index);
                  dragRef.current = null; setDragIndex(null); setOverIndex(null);
                }}
                className={`cursor-move rounded-xl border bg-panel-surface p-5 transition-all ${
                  overIndex === index && dragIndex !== index
                    ? 'border-emerald-500 ring-2 ring-emerald-500/40'
                    : 'border-panel-line/50'
                } ${dragIndex === index ? 'opacity-40' : ''}`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-3xl leading-none" aria-hidden="true">{card.icon || '—'}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-panel-strong">{card.title}</p>
                    <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-panel-body">
                      {card.description || <span className="text-panel-muted">No description</span>}
                    </p>
                    <p className="mt-2 text-[10px] uppercase tracking-wider text-panel-muted">{card.color}</p>
                  </div>
                </div>
                <div className="mt-4 flex gap-1 border-t border-panel-line/30 pt-3">
                  <Button size="sm" variant="secondary" onClick={() => {
                    setEditId(card.id);
                    setForm({
                      title: card.title,
                      description: card.description ?? '',
                      icon: card.icon ?? '',
                      color: card.color,
                    });
                    setShowModal(true);
                  }}>Edit</Button>
                  <Button size="sm" variant="danger" onClick={() => setConfirmDelete(card)}>Delete</Button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editId ? 'Edit Card' : 'New Card'}
        maxWidth="max-w-lg"
      >
        <div className="space-y-4">
          <FormField label="Title *">
            <Input maxLength={255} value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </FormField>
          <FormField label="Description">
            <Textarea rows={4} maxLength={2000} value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Icon">
              <Input maxLength={50} placeholder="📹" value={form.icon}
                onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))} />
              <p className="mt-1 text-xs text-panel-muted">A single emoji. Shown large above the title.</p>
            </FormField>
            <FormField label="Colour">
              <Select options={COLORS} value={form.color}
                onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} />
              <p className="mt-1 text-xs text-panel-muted">Tints the card background and heading.</p>
            </FormField>
          </div>
          <div className="flex justify-end gap-2 border-t border-panel-line/50 pt-4">
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={save}>{editId ? 'Save Changes' : 'Create'}</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={remove}
        title="Delete card"
        message={`Delete ${confirmDelete?.title ?? 'this card'}? It will stop showing on the public page.`}
        confirmLabel="Delete"
        destructive
      />
      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}
