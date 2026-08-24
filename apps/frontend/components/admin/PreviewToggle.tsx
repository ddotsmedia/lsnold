'use client';

import { useEffect, useState } from 'react';

/**
 * Viewport width picker for the section preview.
 *
 * Widths are the ones the site's own breakpoints turn on at, so the preview
 * lands either side of a real boundary rather than at an arbitrary size.
 */

export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

export const BREAKPOINT_WIDTH: Record<Breakpoint, number> = {
  mobile: 375,
  tablet: 768,
  desktop: 1024,
};

const OPTIONS: { value: Breakpoint; label: string; icon: string }[] = [
  { value: 'mobile', label: 'Mobile', icon: '▯' },
  { value: 'tablet', label: 'Tablet', icon: '▭' },
  { value: 'desktop', label: 'Desktop', icon: '▬' },
];

const STORAGE_KEY = 'lsn_preview_breakpoint';

function isBreakpoint(v: string | null): v is Breakpoint {
  return v === 'mobile' || v === 'tablet' || v === 'desktop';
}

/**
 * Remembers the choice per browser.
 *
 * Reads in an effect rather than during useState's initialiser: the server
 * render has no localStorage, and seeding state from it directly makes the
 * first client render disagree with the HTML.
 */
export function useBreakpoint(): [Breakpoint, (b: Breakpoint) => void] {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>('desktop');

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (isBreakpoint(stored)) setBreakpoint(stored);
    } catch {
      // Private mode, or storage disabled. The default is fine.
    }
  }, []);

  const choose = (b: Breakpoint): void => {
    setBreakpoint(b);
    try {
      window.localStorage.setItem(STORAGE_KEY, b);
    } catch {
      // Not worth surfacing — the choice still applies for this session.
    }
  };

  return [breakpoint, choose];
}

export function PreviewToggle({
  value,
  onChange,
  className = '',
}: {
  value: Breakpoint;
  onChange: (b: Breakpoint) => void;
  className?: string;
}) {
  return (
    <div
      className={`inline-flex rounded-lg border border-panel-line bg-panel-sunken p-0.5 ${className}`}
      role="group"
      aria-label="Preview width"
    >
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          title={`${o.label} — ${BREAKPOINT_WIDTH[o.value]}px`}
          className={`flex min-h-8 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors ${
            value === o.value
              ? 'bg-emerald-500/15 text-emerald-400'
              : 'text-panel-muted hover:text-panel-body'
          }`}
        >
          <span aria-hidden="true">{o.icon}</span>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default PreviewToggle;
