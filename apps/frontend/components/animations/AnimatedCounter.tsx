'use client';

import { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion } from 'framer-motion';
import { useSkipAnimation } from '../../lib/useIsMobile';

/**
 * Counts up to a number when it scrolls into view.
 *
 * Takes the finished string the page already shows — "500+", "4.9", "20+" —
 * and works out what to animate, rather than asking every caller to split the
 * value from its decoration. That keeps the existing copy as the single source
 * of truth: change "500+" to "600+" and the counter follows.
 *
 * A value with no digits at all is rendered untouched.
 */

export interface AnimatedCounterProps {
  /** The final value as displayed, e.g. "500+", "4.9", "15+ staff". */
  value: string;
  className?: string;
  /** Seconds for the whole count. */
  duration?: number;
  delay?: number;
}

/** "500+" -> { prefix: '', target: 500, suffix: '+', decimals: 0 } */
function parse(value: string): { prefix: string; target: number; suffix: string; decimals: number } | null {
  const match = value.match(/^(\D*)(\d+(?:\.\d+)?)(.*)$/s);
  if (!match) return null;
  const [, prefix = '', digits = '', suffix = ''] = match;
  const dot = digits.indexOf('.');
  return {
    prefix,
    target: Number(digits),
    suffix,
    decimals: dot === -1 ? 0 : digits.length - dot - 1,
  };
}

export function AnimatedCounter({
  value,
  className,
  duration = 1.8,
  delay = 0,
}: AnimatedCounterProps) {
  const reduced = useReducedMotion();
  // Also skipped below md: parallax and per-frame counting are the expensive
  // animations, and a phone is where that cost lands hardest.
  const skip = useSkipAnimation(reduced);
  const ref = useRef<HTMLSpanElement>(null);
  // once:true — the number settles on its final value and stays there.
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const parsed = parse(value);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!inView || skip || !parsed) return;

    let frame = 0;
    let start: number | null = null;
    const startedAt = performance.now() + delay * 1000;

    const tick = (now: number) => {
      if (now < startedAt) {
        frame = requestAnimationFrame(tick);
        return;
      }
      if (start === null) start = now;
      const elapsed = (now - start) / (duration * 1000);
      const t = Math.min(elapsed, 1);
      // easeOutCubic: quick to most of the way, then settles — a linear count
      // reads like a loading spinner rather than a number arriving.
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(parsed.target * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, skip, parsed, duration, delay]);

  // No digits to count, or motion is suppressed: show the value as written.
  if (!parsed || skip) {
    return <span ref={ref} className={className}>{value}</span>;
  }

  const display = inView ? shown.toFixed(parsed.decimals) : (0).toFixed(parsed.decimals);

  return (
    <span ref={ref} className={className}>
      {/* The finished value is announced rather than every intermediate
          number, which would otherwise flood a screen reader mid-count. */}
      <span aria-hidden="true">{parsed.prefix}{display}{parsed.suffix}</span>
      <span className="sr-only">{value}</span>
    </span>
  );
}

export default AnimatedCounter;
