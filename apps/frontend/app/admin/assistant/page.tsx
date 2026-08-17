'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '../../../lib/api';
import { Button, Toast } from '../../../components/admin/shared';

/**
 * Asks questions about the nursery's own figures.
 *
 * The assistant is given aggregate statistics only — no child's name, parent's
 * contact or individual record ever leaves the server. It is told what the
 * database does not hold, so it declines rather than inventing; a plausible
 * guess about a nursery's finances would be worse than no answer.
 */

interface Turn {
  question: string;
  answer?: string;
  error?: string;
  meta?: { model: string; took_ms: number; input_tokens: number; output_tokens: number };
}

interface AskResponse {
  answer: string;
  model: string;
  took_ms: number;
  usage: { input_tokens: number; output_tokens: number };
}

/** Questions the data can actually answer, unlike "revenue" or "capacity". */
const SUGGESTIONS = [
  'Summarise the last seven days of admin activity',
  'How are tour bookings and registrations tracking this month?',
  'Which pages get the most visits, and what does that suggest?',
  'Is any of the website content still unpublished?',
];

const STORAGE_KEY = 'lsn_assistant_history';

export default function AssistantPage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Kept locally so a reload does not lose the thread. Questions only —
  // nothing here is personal, because the assistant is never given anything
  // personal to begin with.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setTurns(JSON.parse(saved) as Turn[]);
    } catch { /* a corrupt entry is not worth failing over */ }
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(turns.slice(-20))); } catch { /* quota */ }
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns]);

  useEffect(() => {
    api<{ configured: boolean }>('/admin/assistant/snapshot')
      .then((res) => setConfigured(res.configured))
      .catch(() => setConfigured(false));
  }, []);

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }
  }, [toast]);

  const send = async (text: string) => {
    const asked = text.trim();
    if (asked.length < 3 || busy) return;

    setQuestion('');
    setTurns((prev) => [...prev, { question: asked }]);
    setBusy(true);

    try {
      const res = await api<AskResponse>('/admin/assistant/ask', {
        method: 'POST',
        body: JSON.stringify({ question: asked }),
      });
      setTurns((prev) => prev.map((turn, i) => i === prev.length - 1
        ? { ...turn, answer: res.answer, meta: { model: res.model, took_ms: res.took_ms, ...res.usage } }
        : turn));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The assistant could not answer that.';
      setTurns((prev) => prev.map((turn, i) => i === prev.length - 1 ? { ...turn, error: message } : turn));
      setToast({ message, type: 'error' });
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-zinc-100">Assistant</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Ask about the nursery&rsquo;s figures. It sees totals only — never a child&rsquo;s
          name, a parent&rsquo;s contact, or any individual record.
        </p>
      </header>

      {configured === false && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          <strong className="font-semibold">Not configured.</strong> The server has no
          ANTHROPIC_API_KEY set, so questions cannot be answered yet. Everything else
          on this page works; it will start answering the moment a key is added.
        </div>
      )}

      <div className="min-h-75 space-y-4 rounded-xl border border-zinc-800/50 bg-[#111119] p-4">
        {turns.length === 0 ? (
          <div className="py-8 text-center">
            <p className="mb-4 text-sm text-zinc-500">Try one of these:</p>
            <div className="mx-auto flex max-w-lg flex-col gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  disabled={busy || configured === false}
                  className="min-h-12 rounded-lg border border-zinc-800 px-3 py-2 text-left text-sm text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200 disabled:opacity-40"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          turns.map((turn, i) => (
            <article key={i} className="space-y-2">
              <p className="ml-auto max-w-[85%] rounded-lg rounded-br-sm bg-emerald-500/15 px-3 py-2 text-sm text-emerald-100">
                {turn.question}
              </p>

              {turn.answer && (
                <div className="max-w-[85%] rounded-lg rounded-bl-sm bg-zinc-800/50 px-3 py-2">
                  {/* Plain text, deliberately: rendering model output as HTML
                      would be an injection route for anything that reaches the
                      figures. whitespace-pre-wrap keeps its paragraphing. */}
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">{turn.answer}</p>
                  {turn.meta && (
                    <p className="mt-2 text-[10px] text-zinc-600">
                      {turn.meta.model} · {turn.meta.took_ms} ms ·{' '}
                      {turn.meta.input_tokens + turn.meta.output_tokens} tokens
                    </p>
                  )}
                </div>
              )}

              {turn.error && (
                <p className="max-w-[85%] rounded-lg rounded-bl-sm border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  {turn.error}
                </p>
              )}

              {!turn.answer && !turn.error && (
                <p className="text-sm text-zinc-600">Thinking…</p>
              )}
            </article>
          ))
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); void send(question); }}
        className="flex gap-2"
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about bookings, registrations, traffic or activity…"
          disabled={busy || configured === false}
          className="min-h-12 flex-1 rounded-lg border border-zinc-800 bg-[#0c0c14] px-3 text-sm text-zinc-100 placeholder-zinc-600 focus:border-emerald-500/50 focus:outline-none disabled:opacity-40"
        />
        <Button type="submit" disabled={busy || question.trim().length < 3 || configured === false}>
          {busy ? 'Asking…' : 'Ask'}
        </Button>
        {turns.length > 0 && (
          <Button type="button" variant="secondary" onClick={() => setTurns([])}>
            Clear
          </Button>
        )}
      </form>

      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}
