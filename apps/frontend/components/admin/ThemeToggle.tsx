'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';

/**
 * Switches the panel between light and dark.
 *
 * Renders a placeholder until mounted. The server has no way of knowing which
 * theme the browser has stored, so rendering the real icon during SSR would
 * guess wrong half the time and React would complain about the mismatch on
 * hydration.
 *
 * Three states rather than two: following the system is a real preference, and
 * a toggle that only flips between light and dark takes it away from anyone who
 * had it. The cycle is system → light → dark → system.
 */

const NEXT_THEME: Record<string, string> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};

const LABELS: Record<string, string> = {
  system: 'Match system',
  light: 'Light',
  dark: 'Dark',
};

const ICONS: Record<string, string> = {
  system: '◐',
  light: '☀',
  dark: '☾',
};

export function ThemeToggle() {
  const { theme = 'system', setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    // Same box as the real control, so the header does not shift on hydration.
    return <span className="inline-block h-12 w-12" aria-hidden="true" />;
  }

  const next = NEXT_THEME[theme] ?? 'light';

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      title={`Theme: ${LABELS[theme] ?? theme}. Click for ${LABELS[next] ?? next}.`}
      aria-label={`Theme: ${LABELS[theme] ?? theme}. Switch to ${LABELS[next] ?? next}.`}
      className="flex h-12 w-12 items-center justify-center rounded-lg border border-panel-line bg-panel-sunken text-lg text-panel-body transition-colors hover:border-panel-line-2 hover:text-panel-strong"
    >
      <span aria-hidden="true">{ICONS[theme] ?? '◐'}</span>
    </button>
  );
}
