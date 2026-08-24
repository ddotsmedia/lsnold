'use client';

import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { useSkipAnimation } from '../../lib/useIsMobile';
import type { ReactNode } from 'react';

/**
 * Fades and lifts a block as it scrolls into view.
 *
 * `once: true` throughout: a reveal that replays every time the block crosses
 * the viewport edge turns into a flicker on a page people scroll up and down.
 *
 * Under prefers-reduced-motion the children render plainly — no wrapper, no
 * initial opacity. That matters more than usual here: the initial state is
 * `opacity: 0`, so a half-honoured implementation would leave the page blank
 * for anyone whose animations are suppressed.
 */

export interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  /** Pixels travelled on the way up. */
  distance?: number;
  duration?: number;
  delay?: number;
  /** Fraction of the block that must be visible before it starts. */
  amount?: number;
  /** Render as something other than a div. */
  as?: 'div' | 'section' | 'article' | 'li';
}

export function ScrollReveal({
  children,
  className,
  distance = 28,
  duration = 0.55,
  delay = 0,
  amount = 0.2,
  as = 'div',
}: ScrollRevealProps) {
  const reduced = useReducedMotion();
  // Also skipped below md: parallax and per-frame counting are the expensive
  // animations, and a phone is where that cost lands hardest.
  const skip = useSkipAnimation(reduced);
  const Tag = motion[as];

  if (skip) {
    const Plain = as;
    return <Plain className={className}>{children}</Plain>;
  }

  return (
    <Tag
      className={className}
      initial={{ opacity: 0, y: distance }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount }}
      transition={{ duration, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </Tag>
  );
}

/* -------------------------------------------------------------------------- */
/* Staggered groups                                                            */
/* -------------------------------------------------------------------------- */

const container: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.05 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
};

/**
 * Reveals its children one after another rather than as one block.
 *
 * Each child must be a `<ScrollRevealItem>` — the stagger is driven by variant
 * inheritance, so a plain element in here simply will not animate.
 */
export function ScrollRevealGroup({
  children,
  className,
  amount = 0.15,
}: {
  children: ReactNode;
  className?: string;
  amount?: number;
}) {
  const reduced = useReducedMotion();
  // Also skipped below md: parallax and per-frame counting are the expensive
  // animations, and a phone is where that cost lands hardest.
  const skip = useSkipAnimation(reduced);
  if (skip) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      variants={container}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount }}
    >
      {children}
    </motion.div>
  );
}

export function ScrollRevealItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();
  // Also skipped below md: parallax and per-frame counting are the expensive
  // animations, and a phone is where that cost lands hardest.
  const skip = useSkipAnimation(reduced);
  if (skip) return <div className={className}>{children}</div>;
  return <motion.div className={className} variants={item}>{children}</motion.div>;
}

export default ScrollReveal;
