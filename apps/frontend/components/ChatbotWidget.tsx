'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/api';
import { usePhone } from '@/lib/footer';

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

type Sender = 'visitor' | 'bot' | 'admin';

interface ChatMessage {
  id: string;
  sender: Sender;
  message: string;
  created_at: string;
}

interface ChatbotSettings {
  bot_name: string;
  welcome_message: string;
  fallback_message: string;
  whatsapp_number: string;
  office_phone: string;
  is_enabled: boolean;
}

interface MessageResponse {
  conversation_id: string;
  visitor_message: ChatMessage;
  bot_message: ChatMessage;
  escalated: boolean;
  matched_category: string | null;
}

interface ConversationResponse {
  id: string;
  status: 'active' | 'escalated' | 'closed';
  messages: ChatMessage[];
}

interface VisitorDetails {
  name: string;
  email: string;
  phone: string;
}

/* -------------------------------------------------------------------------- */
/* Constants                                                                   */
/* -------------------------------------------------------------------------- */

const STORAGE_KEY = 'lsn_chat_conversation';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMPTY_VISITOR: VisitorDetails = { name: '', email: '', phone: '' };

const cx = (...classes: Array<string | false | undefined>): string =>
  classes.filter(Boolean).join(' ');

/* -------------------------------------------------------------------------- */
/* Sub-components                                                              */
/* -------------------------------------------------------------------------- */

function ChatIcon({ open }: { open: boolean }) {
  return (
    <svg
      width={26}
      height={26}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {open ? (
        <>
          <line x1="5" y1="5" x2="19" y2="19" />
          <line x1="19" y1="5" x2="5" y2="19" />
        </>
      ) : (
        <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
      )}
    </svg>
  );
}

/** Three bouncing dots shown while the bot is composing a reply. */
function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-2" role="status" aria-label="Assistant is typing">
      <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:150ms]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:300ms]" />
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isVisitor = message.sender === 'visitor';
  const isAdmin = message.sender === 'admin';

  return (
    <div className={cx('flex', isVisitor ? 'justify-end' : 'justify-start')}>
      <div
        className={cx(
          'max-w-[85%] rounded-2xl px-4 py-2 text-sm leading-relaxed whitespace-pre-wrap wrap-break-word',
          isVisitor && 'rounded-br-sm bg-blue-800 text-white',
          isAdmin && 'rounded-bl-sm border border-green-300 bg-green-50 text-gray-800',
          !isVisitor && !isAdmin && 'rounded-bl-sm bg-gray-100 text-gray-800',
        )}
      >
        {isAdmin && (
          <span className="mb-1 block text-xs font-semibold text-green-700">Little Smarties team</span>
        )}
        {message.message}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Widget                                                                      */
/* -------------------------------------------------------------------------- */

export function ChatbotWidget() {
  const phone = usePhone();
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith('/admin') ?? false;
  const [settings, setSettings] = useState<ChatbotSettings | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [visitor, setVisitor] = useState<VisitorDetails>(EMPTY_VISITOR);
  const [contactSaved, setContactSaved] = useState(false);
  const [formErrors, setFormErrors] = useState<Partial<VisitorDetails>>({});
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [escalated, setEscalated] = useState(false);
  const [callbackState, setCallbackState] = useState<'idle' | 'sending' | 'sent'>('idle');

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  /* --- settings ---------------------------------------------------------- */

  useEffect(() => {
    if (isAdminRoute) return;
    let cancelled = false;
    api<ChatbotSettings>('/chatbot/settings')
      .then((data) => {
        if (!cancelled) setSettings(data);
      })
      .catch(() => {
        // Backend unreachable or chatbot not migrated yet: stay hidden rather
        // than showing a button that cannot do anything.
        if (!cancelled) setSettings(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdminRoute]);

  /* --- restore an in-progress conversation -------------------------------- */

  useEffect(() => {
    if (isAdminRoute) return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return;

    api<ConversationResponse>(`/chatbot/conversations/${stored}`)
      .then((data) => {
        if (data.status === 'closed') {
          window.localStorage.removeItem(STORAGE_KEY);
          return;
        }
        setConversationId(data.id);
        setMessages(data.messages);
        setEscalated(data.status === 'escalated');
      })
      .catch(() => {
        // Stale id (e.g. database reset) — start fresh.
        window.localStorage.removeItem(STORAGE_KEY);
      });
  }, [isAdminRoute]);

  /* --- keep the thread scrolled to the newest message --------------------- */

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    // Setting scrollTop keeps the scrolling inside the panel; scrollIntoView
    // would drag the whole page towards the widget.
    container.scrollTop = container.scrollHeight;
  }, [messages, isSending, isOpen]);

  /* --- close on Escape ---------------------------------------------------- */

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  /* --- actions ------------------------------------------------------------ */

  /**
   * Contact details are collected only once the bot cannot answer, so a visitor
   * can ask "what time do you open" without handing over an email first.
   */
  const saveContact = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const errors: Partial<VisitorDetails> = {};
    if (visitor.name.trim().length < 2) errors.name = 'Please tell us your name.';
    if (!EMAIL_PATTERN.test(visitor.email.trim())) errors.email = 'Please enter a valid email.';

    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    try {
      await api('/chatbot/message', {
        method: 'POST',
        body: JSON.stringify({
          conversation_id: conversationId ?? undefined,
          message: '[contact details provided]',
          visitor_name: visitor.name.trim(),
          visitor_email: visitor.email.trim(),
          visitor_phone: visitor.phone.trim() || undefined,
        }),
      });
      setContactSaved(true);
    } catch {
      setError(`We could not save your details. Please call us on ${phone}.`);
    }
  };

  const sendMessage = useCallback(async () => {
    const text = draft.trim();
    if (!text || isSending) return;

    setIsSending(true);
    setError(null);

    // Show the visitor's own message immediately; the server echoes back a
    // persisted copy that replaces this optimistic one.
    const optimistic: ChatMessage = {
      id: `pending-${Date.now()}`,
      sender: 'visitor',
      message: text,
      created_at: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimistic]);
    setDraft('');

    try {
      const response = await api<MessageResponse>('/chatbot/message', {
        method: 'POST',
        body: JSON.stringify({
          conversation_id: conversationId ?? undefined,
          message: text,
          visitor_name: visitor.name.trim() || undefined,
          visitor_email: visitor.email.trim() || undefined,
          visitor_phone: visitor.phone.trim() || undefined,
        }),
      });

      setConversationId(response.conversation_id);
      window.localStorage.setItem(STORAGE_KEY, response.conversation_id);
      setEscalated(response.escalated);
      setMessages((current) => [
        ...current.filter((m) => m.id !== optimistic.id),
        response.visitor_message,
        response.bot_message,
      ]);
    } catch {
      setMessages((current) => current.filter((m) => m.id !== optimistic.id));
      setDraft(text);
      setError(`Your message did not send. Please try again, or call us on ${phone}.`);
    } finally {
      setIsSending(false);
    }
  }, [draft, isSending, conversationId, visitor]);

  const requestCallback = async (): Promise<void> => {
    if (callbackState !== 'idle') return;
    setCallbackState('sending');
    setError(null);
    try {
      await api('/chatbot/book-appointment', {
        method: 'POST',
        body: JSON.stringify({
          conversation_id: conversationId ?? undefined,
          visitor_name: visitor.name.trim(),
          visitor_email: visitor.email.trim(),
          visitor_phone: visitor.phone.trim(),
          notes: 'Callback requested from the website chat.',
        }),
      });
      setCallbackState('sent');
    } catch {
      setCallbackState('idle');
      setError(`We could not send that request. Please call us on ${phone}.`);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  };

  /* --- render ------------------------------------------------------------- */

  // Hidden on the admin panel, and when the backend is unreachable or the bot
  // is switched off.
  if (isAdminRoute || !settings || !settings.is_enabled) return null;

  const canRequestCallback =
    conversationId !== null && visitor.phone.trim().length >= 7 && callbackState !== 'sent';

  return (
    <>
      {isOpen && (
        <div
          role="dialog"
          aria-label={`Chat with ${settings.bot_name}`}
          className={cx(
            'fixed bottom-24 right-4 z-50 flex flex-col overflow-hidden rounded-2xl',
            'border border-gray-200 bg-white shadow-2xl md:right-6',
            'w-[calc(100vw-2rem)] sm:w-96',
            'h-[min(600px,calc(100dvh-9rem))]',
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 bg-blue-800 px-4 py-3 text-white">
            <div>
              <p className="text-sm font-bold">{settings.bot_name}</p>
              <p className="text-xs text-blue-100">Little Smarties Nursery</p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Close chat"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-blue-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <line x1="5" y1="5" x2="19" y2="19" />
                <line x1="19" y1="5" x2="5" y2="19" />
              </svg>
            </button>
          </div>

          <>
              {/* Thread */}
              <div
                ref={scrollRef}
                role="log"
                aria-live="polite"
                aria-label="Conversation"
                className="flex-1 space-y-3 overflow-y-auto p-4"
              >
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-gray-100 px-4 py-2 text-sm leading-relaxed text-gray-800">
                    {settings.welcome_message}
                  </div>
                </div>

                {messages.map((message) => (
                  <MessageBubble key={message.id} message={message} />
                ))}

                {isSending && <TypingDots />}

                {escalated && !isSending && (
                  <div className="rounded-lg bg-amber-50 p-3">
                    <p className="text-xs text-amber-800">
                      Our team has been notified and will reply here. You can also reach us on{' '}
                      {settings.office_phone}.
                    </p>

                    {!contactSaved && (
                      <form onSubmit={(e) => void saveContact(e)} className="mt-3" noValidate>
                        <p className="mb-2 text-xs font-semibold text-amber-900">
                          Leave your details so we can get back to you:
                        </p>
                        <input
                          aria-label="Your name"
                          placeholder="Your name"
                          value={visitor.name}
                          onChange={(e) => setVisitor((v) => ({ ...v, name: e.target.value }))}
                          aria-invalid={formErrors.name ? true : undefined}
                          className="mb-1 w-full rounded border border-amber-300 p-2 text-xs focus:border-amber-600 focus:outline-none"
                        />
                        {formErrors.name && <p className="mb-1 text-xs text-red-600">{formErrors.name}</p>}
                        <input
                          type="email"
                          autoComplete="email"
                          aria-label="Your email"
                          placeholder="Email"
                          value={visitor.email}
                          onChange={(e) => setVisitor((v) => ({ ...v, email: e.target.value }))}
                          aria-invalid={formErrors.email ? true : undefined}
                          className="mb-1 w-full rounded border border-amber-300 p-2 text-xs focus:border-amber-600 focus:outline-none"
                        />
                        {formErrors.email && <p className="mb-1 text-xs text-red-600">{formErrors.email}</p>}
                        <input
                          type="tel"
                          autoComplete="tel"
                          aria-label="Your phone (optional)"
                          placeholder="Phone (optional)"
                          value={visitor.phone}
                          onChange={(e) => setVisitor((v) => ({ ...v, phone: e.target.value }))}
                          className="mb-2 w-full rounded border border-amber-300 p-2 text-xs focus:border-amber-600 focus:outline-none"
                        />
                        <button
                          type="submit"
                          className="min-h-9 w-full rounded bg-amber-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-amber-700"
                        >
                          Send my details
                        </button>
                      </form>
                    )}

                    {contactSaved && (
                      <p className="mt-2 text-xs font-semibold text-green-700">
                        Thanks — we have your details.
                      </p>
                    )}
                  </div>
                )}

                {callbackState === 'sent' && (
                  <p className="rounded-lg bg-green-50 p-3 text-xs text-green-800">
                    Thanks — we have your details and will call you back.
                  </p>
                )}
              </div>

              {error && (
                <p role="alert" className="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
                  {error}
                </p>
              )}

              {canRequestCallback && (
                <button
                  type="button"
                  onClick={() => void requestCallback()}
                  disabled={callbackState === 'sending'}
                  className="border-t border-gray-100 px-4 py-2 text-left text-xs font-semibold text-blue-800 transition-colors hover:bg-blue-50 disabled:opacity-60"
                >
                  {callbackState === 'sending' ? 'Sending…' : 'Ask us to call you back'}
                </button>
              )}

              {/* Composer */}
              <div className="flex items-end gap-2 border-t border-gray-200 p-3">
                <label htmlFor="chat-input" className="sr-only">
                  Your message
                </label>
                <textarea
                  id="chat-input"
                  ref={inputRef}
                  rows={1}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about hours, fees, tours…"
                  className="max-h-24 flex-1 resize-none rounded-lg border-2 border-gray-300 p-2 text-sm focus:border-blue-800 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void sendMessage()}
                  disabled={isSending || draft.trim().length === 0}
                  aria-label="Send message"
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-red-600 text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                >
                  <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a.993.993 0 00-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z" />
                  </svg>
                </button>
              </div>
          </>
        </div>
      )}

      {/* Launcher */}
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-label={isOpen ? 'Close chat' : `Chat with ${settings.bot_name}`}
        className={cx(
          'fixed bottom-6 right-4 z-50 inline-flex h-14 w-14 items-center justify-center',
          'rounded-full bg-blue-800 text-white shadow-lg transition-all duration-200 ease-in-out',
          'hover:scale-105 hover:bg-blue-900 focus-visible:outline-none focus-visible:ring-2',
          'focus-visible:ring-blue-800 focus-visible:ring-offset-2 md:right-6',
        )}
      >
        <ChatIcon open={isOpen} />
      </button>
    </>
  );
}

export default ChatbotWidget;
