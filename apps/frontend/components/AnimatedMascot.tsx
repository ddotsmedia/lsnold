'use client';

import { motion, useReducedMotion } from 'framer-motion';

/**
 * A waving character beside the hero.
 *
 * The wave is a transform-only loop on a single small element, which is cheap
 * enough to keep running on a phone — so unlike ScrollReveal this deliberately
 * does not use useSkipAnimation.
 *
 * prefers-reduced-motion is still honoured. The brief asked for "no
 * reduced-motion issues", which reads as "keep it on mobile"; ignoring the
 * setting outright would be an accessibility regression, and a waving arm is
 * exactly the repeating motion that setting exists to stop. Reduced motion gets
 * the mascot standing still rather than nothing at all.
 *
 * Decorative: aria-hidden throughout, so a screen reader is not told about a
 * rabbit that carries no information.
 */

export interface AnimatedMascotProps {
  /** The character. Any emoji works; the arm is drawn separately. */
  face?: string;
  className?: string;
}

export function AnimatedMascot({ face = '🐰', className = '' }: AnimatedMascotProps) {
  const reduced = useReducedMotion();

  return (
    <div
      className={`pointer-events-none relative select-none ${className}`}
      aria-hidden="true"
    >
      {reduced ? (
        <span className="block text-5xl leading-none md:text-6xl">{face}</span>
      ) : (
        <motion.div
          className="relative"
          // Enters once as it scrolls in, then the wave takes over.
          initial={{ opacity: 0, scale: 0.8, rotate: -15 }}
          whileInView={{ opacity: 1, scale: 1, rotate: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.span
            className="block text-5xl leading-none md:text-6xl"
            // A gentle bob under the arm, so the whole character feels alive
            // rather than a still image with one moving part.
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            {face}
          </motion.span>

          {/* The waving arm. Its own element so the face stays upright. */}
          <motion.span
            className="absolute -right-2 top-1 text-2xl leading-none md:text-3xl"
            style={{ transformOrigin: 'bottom left' }}
            animate={{ rotate: [0, 24, -6, 24, 0] }}
            transition={{ duration: 1, repeat: Infinity, repeatDelay: 0.6, ease: 'easeInOut' }}
          >
            👋
          </motion.span>
        </motion.div>
      )}
    </div>
  );
}

export default AnimatedMascot;
