'use client';

import { motion, useReducedMotion } from 'framer-motion';

export type BalloonColor = 'red' | 'blue' | 'green' | 'amber' | 'pink';

export interface FloatingBalloonProps {
  color?: BalloonColor;
  /** Positioning and size, e.g. "absolute left-[8%] top-[20%] w-16". */
  className?: string;
  /** Seconds per drift cycle. Vary it across a group so they desynchronise. */
  duration?: number;
  delay?: number;
}

/**
 * Tailwind resolves class names statically, so each colour is spelled out
 * rather than interpolated. Two stops per balloon: the lit side and the body.
 */
const COLORS: Record<BalloonColor, { light: string; body: string; string: string }> = {
  red: { light: '#f87171', body: '#dc2626', string: '#9ca3af' },
  blue: { light: '#60a5fa', body: '#2563eb', string: '#9ca3af' },
  green: { light: '#4ade80', body: '#16a34a', string: '#9ca3af' },
  amber: { light: '#fbbf24', body: '#d97706', string: '#9ca3af' },
  pink: { light: '#f472b6', body: '#db2777', string: '#9ca3af' },
};

/**
 * A balloon that drifts up and tilts, for hero and section decoration.
 *
 * Decorative only — aria-hidden, so it never reaches a screen reader.
 * Honours prefers-reduced-motion by rendering static.
 */
export function FloatingBalloon({
  color = 'red',
  className = 'w-16',
  duration = 6,
  delay = 0,
}: FloatingBalloonProps) {
  const reduced = useReducedMotion();
  const palette = COLORS[color];

  const balloon = (
    <svg viewBox="0 0 64 96" fill="none" className="h-auto w-full" aria-hidden="true">
      <ellipse cx="32" cy="34" rx="24" ry="30" fill={palette.body} />
      {/* Highlight, offset up-left so the light reads as coming from above. */}
      <ellipse cx="24" cy="24" rx="8" ry="12" fill={palette.light} opacity="0.7" />
      {/* The knot. */}
      <path d="M32 64 l-4 6 h8 z" fill={palette.body} />
      {/* The string, curved so it reads as slack rather than taut. */}
      <path
        d="M32 70 q6 10 0 20 q-6 10 0 6"
        stroke={palette.string}
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );

  if (reduced) {
    return <div className={className} aria-hidden="true">{balloon}</div>;
  }

  return (
    <motion.div
      className={className}
      aria-hidden="true"
      initial={{ y: 0, rotate: 0 }}
      animate={{ y: [0, -18, 0], rotate: [0, -4, 0, 4, 0] }}
      transition={{ duration, delay, repeat: Infinity, ease: 'easeInOut' }}
    >
      {balloon}
    </motion.div>
  );
}

export default FloatingBalloon;
