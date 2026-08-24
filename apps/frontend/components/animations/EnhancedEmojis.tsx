'use client';

import { motion, useReducedMotion, type Variants } from 'framer-motion';
import type { CSSProperties } from 'react';

/**
 * Animated emoji primitives for the public site.
 *
 * Every one of them renders a plain, still emoji when the visitor has asked for
 * reduced motion. That is not belt-and-braces: globals.css forces
 * `animation-duration: 0.01ms !important` on everything under that media query,
 * which would make a CSS animation snap rather than stop — and these are
 * JS-driven, so the CSS rule would not reach them at all. Checking here is the
 * only thing that actually honours the request.
 *
 * All of them are decoration and are hidden from assistive tech. A screen
 * reader announcing "balloon balloon star balloon" adds nothing.
 */

export interface EmojiProps {
  emoji: string;
  /** Position and size, e.g. "absolute left-[8%] top-10 text-4xl". */
  className?: string;
  /** Seconds per cycle. */
  duration?: number;
  /** Seconds before starting — the lever for staggering a group. */
  delay?: number;
  style?: CSSProperties;
}

const hidden = { 'aria-hidden': true as const };

/** Shared by every variant: still emoji, no motion component, no timers. */
function Still({ emoji, className, style }: EmojiProps) {
  return (
    <span className={className} style={style} {...hidden}>
      {emoji}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Variants                                                                    */
/* -------------------------------------------------------------------------- */

/** Long vertical drift. The range is deliberately wide — this reads at a glance. */
export function FloatingEmoji({ emoji, className, duration = 3.5, delay = 0, style }: EmojiProps) {
  const reduced = useReducedMotion();
  if (reduced) return <Still emoji={emoji} className={className} style={style} />;

  return (
    <motion.span
      className={className}
      style={style}
      {...hidden}
      animate={{ y: [-50, 50, -50] }}
      transition={{ duration, delay, repeat: Infinity, ease: 'easeInOut' }}
    >
      {emoji}
    </motion.span>
  );
}

/** Elastic hop with a beat between bounces, so it reads as playful not frantic. */
export function BouncingEmoji({ emoji, className, duration = 0.8, delay = 0, style }: EmojiProps) {
  const reduced = useReducedMotion();
  if (reduced) return <Still emoji={emoji} className={className} style={style} />;

  return (
    <motion.span
      className={className}
      style={style}
      {...hidden}
      animate={{ y: [0, -28, 0] }}
      transition={{
        duration,
        delay,
        repeat: Infinity,
        repeatDelay: 0.2,
        ease: [0.34, 1.56, 0.64, 1],
      }}
    >
      {emoji}
    </motion.span>
  );
}

export function SpinningEmoji({ emoji, className, duration = 2.5, delay = 0, style }: EmojiProps) {
  const reduced = useReducedMotion();
  if (reduced) return <Still emoji={emoji} className={className} style={style} />;

  return (
    <motion.span
      className={className}
      style={style}
      {...hidden}
      animate={{ rotate: 360 }}
      transition={{ duration, delay, repeat: Infinity, ease: 'linear' }}
    >
      {emoji}
    </motion.span>
  );
}

export function PulsingEmoji({ emoji, className, duration = 1.5, delay = 0, style }: EmojiProps) {
  const reduced = useReducedMotion();
  if (reduced) return <Still emoji={emoji} className={className} style={style} />;

  return (
    <motion.span
      className={className}
      style={style}
      {...hidden}
      animate={{ scale: [1, 1.3, 1] }}
      transition={{ duration, delay, repeat: Infinity, ease: 'easeInOut' }}
    >
      {emoji}
    </motion.span>
  );
}

export function WiggleEmoji({ emoji, className, duration = 1.2, delay = 0, style }: EmojiProps) {
  const reduced = useReducedMotion();
  if (reduced) return <Still emoji={emoji} className={className} style={style} />;

  return (
    <motion.span
      className={className}
      style={style}
      {...hidden}
      animate={{ rotate: [-5, 5, -5] }}
      transition={{ duration, delay, repeat: Infinity, ease: 'easeInOut' }}
    >
      {emoji}
    </motion.span>
  );
}

/**
 * Drifts on both axes at once. The x and y cycles run over the same duration
 * but through a different number of stops, so the path traces a lazy figure
 * rather than a straight diagonal.
 */
export function FloatingSideways({ emoji, className, duration = 4.5, delay = 0, style }: EmojiProps) {
  const reduced = useReducedMotion();
  if (reduced) return <Still emoji={emoji} className={className} style={style} />;

  return (
    <motion.span
      className={className}
      style={style}
      {...hidden}
      animate={{ x: [0, 24, 0, -24, 0], y: [0, -30, 0] }}
      transition={{ duration, delay, repeat: Infinity, ease: 'easeInOut' }}
    >
      {emoji}
    </motion.span>
  );
}

/* -------------------------------------------------------------------------- */
/* Orchestration                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Fades a group in one after another as it scrolls into view.
 *
 * `once` so the cascade plays on arrival and never replays — a group that
 * re-triggers every time it crosses the viewport edge is distracting on a
 * page people scroll up and down.
 */
export const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.18 } },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, scale: 0.6 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.45, ease: 'easeOut' } },
};

export function EmojiGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className} {...hidden}>{children}</div>;

  return (
    <motion.div
      className={className}
      {...hidden}
      variants={staggerContainer}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.3 }}
    >
      {children}
    </motion.div>
  );
}

/** One member of an EmojiGroup. Wraps a variant so the cascade drives its entry. */
export function EmojiGroupItem({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();
  if (reduced) return <>{children}</>;
  return <motion.span variants={staggerItem} className="inline-block">{children}</motion.span>;
}
