'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { api } from '../../../lib/api';
import { clearFaqCache } from '../../../lib/faqs';
import {
  Button,
  ConfirmDialog,
  FormField,
  Input,
  Modal,
  Textarea,
  Toast,
} from '../../../components/admin/shared';

interface AdminFaq {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  display_order: number;
  published: boolean;
}

interface Draft {
  question: string;
  answer: string;
  category: string;
  published: boolean;
}

const EMPTY: Draft = { question: '', answer: '', category: '', published: true };

const toDraft = (f: AdminFaq): Draft => ({
  question: f.question,
  answer: f.answer,
  category: f.category ?? '',
  published: f.published,
});

const dirty = (a: Draft, b: Draft): boolean =>
  a.question.trim() !== b.question.trim() ||
  a.answer.trim() !== b.answer.trim() ||
  a.category.trim() !== b.category.trim() ||
  a.published !== b.published;

/**
 * The contact page's FAQs.
 *
 * Order is changed with Move up / Move down rather than dragging: both are
 * keyboard-reachable, and one press sends the whole new order in a single
 * request instead of a PUT per row that shifted.
 */
export default function FaqsPage() {
  const [faqs, setFaqs] = useState<AdminFaq[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<AdminFaq | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newFaq, setNewFaq] = useState<Draft>(EMPTY);
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const fail = (err: unknown, fallback: string): void =>
    setToast({ message: err instanceof Error ? err.message : fallback, type: 'error' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api<AdminFaq[]>('/admin/faqs');
      setFaqs(rows);
      setDrafts(Object.fromEntries(rows.map((r) => [r.id, toDraft(r)])));
    } catch (err) {
      fail(err, 'Failed to load FAQs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const save = async (faq: AdminFaq): Promise<void> => {
    const draft = drafts[faq.id];
    if (!draft) return;
    if (!draft.question.trim() || !draft.answer.trim()) {
      setToast({ message: 'A question and an answer are both required', type: 'error' });
      return;
    }

    setSavingId(faq.id);
    try {
      const saved = await api<AdminFaq>(`/admin/faqs/${faq.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          question: draft.question.trim(),
          answer: draft.answer.trim(),
          category: draft.category.trim() || null,
          published: draft.published,
        }),
      });
      setFaqs((prev) => prev.map((f) => (f.id === faq.id ? saved : f)));
      setDrafts((prev) => ({ ...prev, [faq.id]: toDraft(saved) }));
      clearFaqCache();
      setToast({ message: 'Question saved', type: 'success' });
    } catch (err) {
      fail(err, 'Failed to save');
    } finally {
      setSavingId(null);
    }
  };

  const add = async (): Promise<void> => {
    if (!newFaq.question.trim() || !newFaq.answer.trim()) {
      setToast({ message: 'A question and an answer are both required', type: 'error' });
      return;
    }
    setAdding(true);
    try {
      const created = await api<AdminFaq>('/admin/faqs', {
        method: 'POST',
        body: JSON.stringify({
          question: newFaq.question.trim(),
          answer: newFaq.answer.trim(),
          category: newFaq.category.trim() || null,
          published: newFaq.published,
        }),
      });
      setFaqs((prev) => [...prev, created]);
      setDrafts((prev) => ({ ...prev, [created.id]: toDraft(created) }));
      clearFaqCache();
      setAddOpen(false);
      setNewFaq(EMPTY);
      setToast({ message: 'Question added', type: 'success' });
    } catch (err) {
      fail(err, 'Failed to add question');
    } finally {
      setAdding(false);
    }
  };

  const remove = async (faq: AdminFaq): Promise<void> => {
    try {
      await api(`/admin/faqs/${faq.id}`, { method: 'DELETE' });
      setFaqs((prev) => prev.filter((f) => f.id !== faq.id));
      clearFaqCache();
      setToast({ message: 'Question removed', type: 'success' });
    } catch (err) {
      fail(err, 'Failed to remove question');
    } finally {
      setConfirm(null);
    }
  };

  const move = async (index: number, delta: number): Promise<void> => {
    const target = index + delta;
    if (target < 0 || target >= faqs.length) return;

    const next = [...faqs];
    const moved = next[index];
    const other = next[target];
    if (!moved || !other) return;
    next[index] = other;
    next[target] = moved;
    setFaqs(next);

    try {
      await api('/admin/faqs/reorder', {
        method: 'PUT',
        body: JSON.stringify({ ids: next.map((f) => f.id) }),
      });
      clearFaqCache();
    } catch (err) {
      setFaqs(faqs); // put it back rather than leave the screen lying
      fail(err, 'Failed to reorder');
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-panel-strong">FAQs</h1>
          <p className="mt-1 text-sm text-panel-muted">
            The questions and answers shown at the bottom of the contact page.
          </p>
        </div>
        <Button onClick={() => { setNewFaq(EMPTY); setAddOpen(true); }}>Add question</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-400/30 border-t-emerald-400" />
        </div>
      ) : faqs.length === 0 ? (
        <div className="rounded-xl border border-panel-line/50 bg-panel-surface p-8 text-center text-sm text-panel-muted">
          No questions yet. The contact page will show its built-in list until you add one.
        </div>
      ) : (
        <div className="space-y-4">
          {faqs.map((faq, index) => {
            const draft = drafts[faq.id] ?? toDraft(faq);
            const changed = dirty(draft, toDraft(faq));

            return (
              <div
                key={faq.id}
                className="space-y-4 rounded-xl border border-panel-line/50 bg-panel-surface p-4 md:p-5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] text-panel-muted">#{index + 1}</span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Move "${faq.question}" up`}
                      disabled={index === 0}
                      onClick={() => void move(index, -1)}
                    >
                      ↑
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Move "${faq.question}" down`}
                      disabled={index === faqs.length - 1}
                      onClick={() => void move(index, 1)}
                    >
                      ↓
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => setConfirm(faq)}>
                      Delete
                    </Button>
                  </div>
                </div>

                <FormField label="Question">
                  <Input
                    value={draft.question}
                    onChange={(e) =>
                      setDrafts((p) => ({ ...p, [faq.id]: { ...draft, question: e.target.value } }))
                    }
                    maxLength={500}
                  />
                </FormField>

                <FormField label="Answer">
                  <Textarea
                    rows={3}
                    value={draft.answer}
                    onChange={(e) =>
                      setDrafts((p) => ({ ...p, [faq.id]: { ...draft, answer: e.target.value } }))
                    }
                    maxLength={5000}
                  />
                </FormField>

                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="flex items-end gap-4">
                    <FormField label="Category">
                      <Input
                        value={draft.category}
                        onChange={(e) =>
                          setDrafts((p) => ({ ...p, [faq.id]: { ...draft, category: e.target.value } }))
                        }
                        placeholder="optional"
                        maxLength={50}
                        className="w-40"
                      />
                    </FormField>
                    <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-panel-muted">
                      <input
                        type="checkbox"
                        checked={draft.published}
                        onChange={(e) =>
                          setDrafts((p) => ({ ...p, [faq.id]: { ...draft, published: e.target.checked } }))
                        }
                        className="accent-emerald-500"
                      />
                      Published
                    </label>
                  </div>

                  <Button
                    onClick={() => void save(faq)}
                    disabled={!changed || savingId === faq.id}
                  >
                    {savingId === faq.id ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add a question">
        <div className="space-y-4">
          <FormField label="Question">
            <Input
              value={newFaq.question}
              onChange={(e) => setNewFaq({ ...newFaq, question: e.target.value })}
              maxLength={500}
            />
          </FormField>
          <FormField label="Answer">
            <Textarea
              rows={4}
              value={newFaq.answer}
              onChange={(e) => setNewFaq({ ...newFaq, answer: e.target.value })}
              maxLength={5000}
            />
          </FormField>
          <FormField label="Category">
            <Input
              value={newFaq.category}
              onChange={(e) => setNewFaq({ ...newFaq, category: e.target.value })}
              placeholder="optional"
              maxLength={50}
            />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={() => void add()} disabled={adding}>
              {adding ? 'Adding…' : 'Add question'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirm !== null}
        title="Remove this question?"
        message={confirm ? `"${confirm.question}" will no longer appear on the contact page.` : ''}
        confirmLabel="Remove"
        destructive
        onConfirm={() => { if (confirm) void remove(confirm); }}
        onClose={() => setConfirm(null)}
      />

      <AnimatePresence>
        {toast && <Toast message={toast.message} type={toast.type} />}
      </AnimatePresence>
    </div>
  );
}
