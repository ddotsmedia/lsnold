'use client';

import { motion, useReducedMotion } from 'framer-motion';

export interface BouncingEmojiProps {
  /** The emoji to bounce, e.g. "🎈". */
  emoji: string;
  /** Tailwind text size. Defaults to the size the hero decorations use. */
  className?: string;
  /** Seconds per bounce. */
  duration?: number;
  /** Seconds to wait before starting, for staggering a row of them. */
  delay?: number;
  /** Pixels travelled at the top of the bounce. */
  height?: number;
  /**
   * Announced to screen readers. Emoji carry meaning to some readers and noise
   * to others; leave it unset for pure decoration and the element is hidden.
   */
  label?: string;
}

/**
 * An emoji that bounces on a loop.
 *
 * Honours prefers-reduced-motion: with it on, the emoji renders once and stays
 * put rather than being animated at 0.01ms, which is what the global CSS rule
 * in globals.css does to a CSS-driven animation.
 */
export function BouncingEmoji({
  emoji,
  className = 'text-4xl',
  duration = 1.6,
  delay = 0,
  height = 12,
  label,
}: BouncingEmojiProps) {
  const reduced = useReducedMotion();

  const a11y = label
    ? { role: 'img' as const, 'aria-label': label }
    : { 'aria-hidden': true as const };

  if (reduced) {
    return (
      <span className={`inline-block ${className}`} {...a11y}>
        {emoji}
      </span>
    );
  }

  return (
    <motion.span
      className={`inline-block ${className}`}
      {...a11y}
      initial={{ y: 0 }}
      animate={{ y: [0, -height, 0] }}
      transition={{
        duration,
        delay,
        repeat: Infinity,
        // Squash-and-stretch feel: quick up, slow settle.
        ease: [0.4, 0, 0.2, 1],
      }}
    >
      {emoji}
    </motion.span>
  );
}

export default BouncingEmoji;
