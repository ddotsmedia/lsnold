'use client';

import { useRef } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { useSkipAnimation } from '../../lib/useIsMobile';
import type { ReactNode } from 'react';

/**
 * Moves its children more slowly than the page scrolls, so the layer reads as
 * further away.
 *
 * The wrapper is taller than the section it fills and pulled up by half the
 * overhang. Without that the slower layer runs out of image before the section
 * has finished scrolling past and a strip of background shows through at one
 * edge — the usual parallax seam.
 *
 * Progress is measured against this element rather than the window, so several
 * parallax sections on one page each track their own position.
 */

export interface ParallaxBackgroundProps {
  children: ReactNode;
  /**
   * How slowly the layer moves. 0.5 is half page speed; 0 is pinned, 1 matches
   * the page and does nothing.
   */
  speed?: number;
  className?: string;
}

export function ParallaxBackground({
  children,
  speed = 0.5,
  className,
}: ParallaxBackgroundProps) {
  const reduced = useReducedMotion();
  // Also skipped below md: parallax and per-frame counting are the expensive
  // animations, and a phone is where that cost lands hardest.
  const skip = useSkipAnimation(reduced);
  const ref = useRef<HTMLDivElement>(null);

  // start: this element's top meeting the viewport bottom.
  // end:   its bottom meeting the viewport top. So 0 -> 1 across a full pass.
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });

  const overhang = (1 - speed) * 100;
  const travel = useTransform(scrollYProgress, [0, 1], [`-${overhang / 2}%`, `${overhang / 2}%`]);

  if (skip) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div ref={ref} className={`overflow-hidden ${className ?? ''}`}>
      <motion.div
        style={{ y: travel, height: `${100 + overhang}%`, top: `-${overhang / 2}%` }}
        className="absolute inset-x-0 will-change-transform"
      >
        {children}
      </motion.div>
    </div>
  );
}

export default ParallaxBackground;
