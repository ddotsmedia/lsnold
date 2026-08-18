'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import type { PaginatedResponse } from '../../../lib/api';
import { FilterSelect, Toast } from '../../../components/admin/shared';

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

type ConversationStatus = 'active' | 'escalated' | 'closed';

interface ConversationSummary {
  id: string;
  visitor_name: string | null;
  visitor_email: string | null;
  visitor_phone: string | null;
  status: ConversationStatus;
  created_at: string;
  last_message_at: string;
  message_count: number;
  last_message_preview: string | null;
}

interface ChatMessage {
  id: string;
  conversation_id: string;
  sender: 'visitor' | 'bot' | 'admin';
  message: string;
  created_at: string;
}

interface ConversationDetail extends ConversationSummary {
  messages: ChatMessage[];
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'escalated', label: 'Needs reply' },
  { value: 'active', label: 'Active' },
  { value: 'closed', label: 'Closed' },
];

/** Escalated is the queue that needs a human, so it gets the alarming colour. */
const STATUS_STYLES: Record<ConversationStatus, string> = {
  active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  escalated: 'bg-red-500/10 text-red-400 border-red-500/30',
  closed: 'bg-panel-raised-2/30 text-panel-body border-panel-line-2/30',
};

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function ChatbotAdminPage() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const fetchList = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await api<PaginatedResponse<ConversationSummary>>('/admin/chatbot/conversations', {
        params: { status: statusFilter, limit: 50 },
      });
      setConversations(res.data);
    } catch {
      setToast({ message: 'Failed to load conversations', type: 'error' });
    } finally {
      setLoadingList(false);
    }
  }, [statusFilter]);

  const fetchDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);
    try {
      const res = await api<ConversationDetail>(`/admin/chatbot/conversations/${id}`);
      setDetail(res);
    } catch {
      setToast({ message: 'Failed to load conversation', type: 'error' });
      setDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  useEffect(() => {
    if (selectedId) void fetchDetail(selectedId);
  }, [selectedId, fetchDetail]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const sendReply = async (): Promise<void> => {
    const text = reply.trim();
    if (!text || !selectedId || sending) return;

    setSending(true);
    try {
      await api(`/admin/chatbot/conversations/${selectedId}/message`, {
        method: 'POST',
        body: JSON.stringify({ message: text }),
      });
      setReply('');
      await fetchDetail(selectedId);
      await fetchList();
      setToast({ message: 'Reply sent', type: 'success' });
    } catch {
      setToast({ message: 'Failed to send reply', type: 'error' });
    } finally {
      setSending(false);
    }
  };

  const closeConversation = async (): Promise<void> => {
    if (!selectedId) return;
    try {
      await api(`/admin/chatbot/conversations/${selectedId}/close`, { method: 'PATCH' });
      await fetchDetail(selectedId);
      await fetchList();
      setToast({ message: 'Conversation closed', type: 'success' });
    } catch {
      setToast({ message: 'Failed to close conversation', type: 'error' });
    }
  };

  const isClosed = detail?.status === 'closed';

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-panel-strong">Chatbot</h1>
        <p className="mt-1 text-sm text-panel-muted">
          Visitor conversations from the website chat. &ldquo;Needs reply&rdquo; means the bot could
          not answer.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_280px_1fr]">
        {/* ---------------------------------------------------------------- */}
        {/* Left: conversation list                                          */}
        {/* ---------------------------------------------------------------- */}
        <section
          aria-label="Conversations"
          className="rounded-xl border border-panel-line/50 bg-panel-sunken"
        >
          <div className="border-b border-panel-line/50 p-3">
            <FilterSelect
              value={statusFilter}
              onChange={setStatusFilter}
              options={STATUS_OPTIONS}
            />
          </div>

          <div className="max-h-[70vh] overflow-y-auto">
            {loadingList ? (
              <p className="p-4 text-sm text-panel-muted">Loading…</p>
            ) : conversations.length === 0 ? (
              <p className="p-4 text-sm text-panel-muted">No conversations yet.</p>
            ) : (
              <ul>
                {conversations.map((conversation) => {
                  const active = conversation.id === selectedId;
                  return (
                    <li key={conversation.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(conversation.id)}
                        className={`w-full border-b border-panel-line/50 px-4 py-3 text-left transition-colors ${
                          active ? 'bg-emerald-500/10' : 'hover:bg-panel-raised/40'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-panel-strong">
                            {conversation.visitor_name || 'Anonymous visitor'}
                          </span>
                          <span
                            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                              STATUS_STYLES[conversation.status]
                            }`}
                          >
                            {conversation.status}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-xs text-panel-muted">
                          {conversation.last_message_preview || 'No messages'}
                        </p>
                        <p className="mt-1 text-[10px] text-panel-faint">
                          {formatWhen(conversation.last_message_at)} · {conversation.message_count} msg
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Centre: visitor details                                          */}
        {/* ---------------------------------------------------------------- */}
        <section
          aria-label="Visitor details"
          className="rounded-xl border border-panel-line/50 bg-panel-sunken p-4"
        >
          {!detail ? (
            <p className="text-sm text-panel-muted">Select a conversation.</p>
          ) : (
            <>
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-panel-body">
                Visitor
              </h2>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-xs text-panel-muted">Name</dt>
                  <dd className="text-panel-strong">{detail.visitor_name || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-panel-muted">Email</dt>
                  <dd className="break-all text-panel-strong">
                    {detail.visitor_email ? (
                      <a href={`mailto:${detail.visitor_email}`} className="hover:text-emerald-400">
                        {detail.visitor_email}
                      </a>
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-panel-muted">Phone</dt>
                  <dd className="text-panel-strong">
                    {detail.visitor_phone ? (
                      <a href={`tel:${detail.visitor_phone}`} className="hover:text-emerald-400">
                        {detail.visitor_phone}
                      </a>
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-panel-muted">Status</dt>
                  <dd>
                    <span
                      className={`inline-block rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                        STATUS_STYLES[detail.status]
                      }`}
                    >
                      {detail.status}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-panel-muted">Started</dt>
                  <dd className="text-panel-strong">{formatWhen(detail.created_at)}</dd>
                </div>
              </dl>

              {!isClosed && (
                <button
                  type="button"
                  onClick={() => void closeConversation()}
                  className="mt-6 w-full rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/20"
                >
                  Close conversation
                </button>
              )}
            </>
          )}
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Right: thread + reply                                            */}
        {/* ---------------------------------------------------------------- */}
        <section
          aria-label="Message thread"
          className="flex min-h-[60vh] flex-col rounded-xl border border-panel-line/50 bg-panel-sunken"
        >
          {!detail ? (
            <p className="p-4 text-sm text-panel-muted">No conversation selected.</p>
          ) : loadingDetail ? (
            <p className="p-4 text-sm text-panel-muted">Loading messages…</p>
          ) : (
            <>
              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {detail.messages.length === 0 && (
                  <p className="text-sm text-panel-muted">No messages in this conversation.</p>
                )}
                {detail.messages.map((message) => {
                  const isVisitor = message.sender === 'visitor';
                  return (
                    <div
                      key={message.id}
                      className={`flex ${isVisitor ? 'justify-start' : 'justify-end'}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-xl px-3 py-2 text-sm ${
                          isVisitor
                            ? 'bg-panel-raised text-panel-strong'
                            : message.sender === 'admin'
                              ? 'bg-emerald-500/15 text-emerald-100'
                              : 'bg-blue-500/10 text-blue-100'
                        }`}
                      >
                        <span className="mb-1 block text-[10px] uppercase tracking-wide opacity-60">
                          {message.sender} · {formatWhen(message.created_at)}
                        </span>
                        <span className="whitespace-pre-wrap break-words">{message.message}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-panel-line/50 p-3">
                {isClosed ? (
                  <p className="text-xs text-panel-muted">
                    This conversation is closed. Replies are disabled.
                  </p>
                ) : (
                  <div className="flex items-end gap-2">
                    <label htmlFor="admin-reply" className="sr-only">
                      Reply to visitor
                    </label>
                    <textarea
                      id="admin-reply"
                      rows={2}
                      value={reply}
                      onChange={(event) => setReply(event.target.value)}
                      placeholder="Type a reply…"
                      className="flex-1 resize-none rounded-lg border border-panel-line-2 bg-panel-surface p-2 text-sm text-panel-strong placeholder-panel-faint focus:border-emerald-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => void sendReply()}
                      disabled={sending || reply.trim().length === 0}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {sending ? 'Sending…' : 'Send'}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}
