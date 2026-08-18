'use client';

import type { ReactNode } from 'react';

// ---------- Status Badge ----------
const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  approved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  rejected: 'bg-red-500/10 text-red-400 border-red-500/20',
  confirmed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  cancelled: 'bg-red-500/10 text-red-400 border-red-500/20',
  draft: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  published: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  archived: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${STATUS_STYLES[status] || 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>
      {status}
    </span>
  );
}

// ---------- Stat Card ----------
export function StatCard({
  label,
  value,
  sublabel,
  accent = 'emerald',
  className = '',
}: {
  label: string;
  value: string | number;
  sublabel?: string;
  accent?: 'emerald' | 'amber' | 'red' | 'blue' | 'purple';
  /** Lets a caller highlight a card, e.g. when its figure just changed. */
  className?: string;
}) {
  const accents = {
    emerald: 'from-emerald-500/10 to-transparent border-emerald-500/20',
    amber: 'from-amber-500/10 to-transparent border-amber-500/20',
    red: 'from-red-500/10 to-transparent border-red-500/20',
    blue: 'from-blue-500/10 to-transparent border-blue-500/20',
    purple: 'from-purple-500/10 to-transparent border-purple-500/20',
  };

  return (
    <div className={`bg-gradient-to-br ${accents[accent]} rounded-xl border p-5 transition-shadow duration-500 ${className}`}>
      <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold text-zinc-100 tabular-nums">{value}</p>
      {sublabel && <p className="text-xs text-zinc-500 mt-1">{sublabel}</p>}
    </div>
  );
}

// ---------- Modal ----------
export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: string;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative bg-[#111119] rounded-2xl border border-zinc-800/50 ${maxWidth} w-full shadow-2xl`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/50">
          <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-lg transition-colors">×</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

// ---------- Confirm Dialog ----------
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  destructive = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
}) {
  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="max-w-sm">
      <p className="text-sm text-zinc-400 mb-6">{message}</p>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="inline-flex min-h-12 min-w-12 items-center justify-center px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 rounded-lg border border-zinc-800 hover:border-zinc-700 transition-colors">
          Cancel
        </button>
        <button
          onClick={() => { onConfirm(); onClose(); }}
          className={`inline-flex min-h-12 min-w-12 items-center justify-center px-4 py-2 text-sm rounded-lg font-medium transition-colors ${
            destructive
              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30'
              : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30'
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

// ---------- Search Bar ----------
export function SearchBar({
  value,
  onChange,
  placeholder = 'Search...',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[#0c0c14] border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 transition-colors"
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 text-xs">⌕</span>
    </div>
  );
}

// ---------- Filter Select ----------
export function FilterSelect({
  value,
  onChange,
  options,
  allLabel = 'All',
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  allLabel?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-[#0c0c14] border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500/50 transition-colors appearance-none cursor-pointer"
    >
      <option value="">{allLabel}</option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

// ---------- Toast (simple inline) ----------
export function Toast({ message, type = 'success' }: { message: string; type?: 'success' | 'error' }) {
  return (
    <div className={`fixed bottom-6 right-6 z-[60] px-5 py-3 rounded-xl text-sm font-medium shadow-2xl border animate-in slide-in-from-bottom-4 ${
      type === 'error'
        ? 'bg-red-500/10 text-red-400 border-red-500/30'
        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
    }`}>
      {message}
    </div>
  );
}

// ---------- Form Input ----------
export function FormField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">{label}</label>
      {children}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full bg-[#0c0c14] border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 transition-colors ${props.className || ''}`}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full bg-[#0c0c14] border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 transition-colors resize-y min-h-[100px] ${props.className || ''}`}
    />
  );
}

/**
 * Form-field dropdown. Unlike FilterSelect it has no injected "All" option,
 * because a form field is choosing a value rather than narrowing a list.
 */
export function Select({
  options,
  ...props
}: { options: { value: string; label: string }[] } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full bg-[#0c0c14] border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500/50 transition-colors cursor-pointer ${props.className || ''}`}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  ...props
}: {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const variants = {
    primary: 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border-emerald-500/30',
    secondary: 'bg-zinc-800/50 text-zinc-300 hover:bg-zinc-800 border-zinc-700',
    danger: 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border-red-500/30',
    ghost: 'bg-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 border-transparent',
  };
  // 48px floor on both sizes: below that a control is hard to hit accurately on
  // a touch screen, and the admin panel is used from phones. `sm` still reads
  // smaller than `md` through its type size and padding, not its hit area.
  const sizes = {
    sm: 'min-h-12 min-w-12 px-3 py-1.5 text-xs',
    md: 'min-h-12 min-w-12 px-4 py-2 text-sm',
  };

  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center rounded-lg font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${props.className || ''}`}
    >
      {children}
    </button>
  );
}
