'use client';

import { useEffect, useState } from 'react';

/**
 * True below the `md` breakpoint.
 *
 * matchMedia in an effect, not window.innerWidth during render: these
 * components are prerendered, where `window` does not exist, and reading it in
 * the render body throws at build time. Reading it in state's initialiser is
 * no better — the server would compute one value and the client another, and
 * React would flag the mismatch.
 *
 * Returns null until the first effect runs. Callers treat null as "do not
 * animate yet", which keeps a component whose resting state is invisible
 * (ScrollReveal starts at opacity 0) from shipping a blank first paint on any
 * device.
 *
 * Subscribed rather than read once, so rotating a tablet or dragging a desktop
 * window narrow moves it to the static path instead of leaving it animating.
 */

/** Matches Tailwind's md. */
const QUERY = '(max-width: 767px)';

export function useIsMobile(): boolean | null {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    setIsMobile(mq.matches);

    const onChange = (e: MediaQueryListEvent): void => setIsMobile(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}

/**
 * True when the animation should be skipped: reduced motion, a small screen,
 * or not yet known.
 */
export function useSkipAnimation(reduced: boolean | null): boolean {
  const isMobile = useIsMobile();
  return Boolean(reduced) || isMobile !== false;
}
