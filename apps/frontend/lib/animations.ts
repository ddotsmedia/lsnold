'use client';

import type { Variants, Transition } from 'framer-motion';

/**
 * The panel's motion vocabulary.
 *
 * Small and shared on purpose: a handful of movements used consistently reads
 * as one interface, where a different easing per component reads as a bug.
 *
 * Every animation here is suppressed for anyone who has asked their system for
 * reduced motion. MotionConfig in the admin layout carries that preference, so
 * these are written as ordinary variants and the framework drops the transforms
 * rather than each component testing for it. Motion sickness and vestibular
 * disorders are real, and a dashboard that slides and scales regardless is
 * unusable for the people affected.
 */

/** Fast enough not to be waited on, slow enough to be seen. */
const QUICK: Transition = { duration: 0.18, ease: [0.4, 0, 0.2, 1] };
const SETTLED: Transition = { duration: 0.28, ease: [0.16, 1, 0.3, 1] };

/** A dialog arriving: it grows very slightly rather than zooming. */
export const modalPanel: Variants = {
  hidden: { opacity: 0, scale: 0.97, y: 8 },
  visible: { opacity: 1, scale: 1, y: 0, transition: SETTLED },
  exit: { opacity: 0, scale: 0.97, y: 8, transition: QUICK },
};

export const backdrop: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: QUICK },
  exit: { opacity: 0, transition: QUICK },
};

/** A toast comes in from the edge it lives on and leaves the same way. */
export const toast: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: SETTLED },
  exit: { opacity: 0, y: 12, scale: 0.98, transition: QUICK },
};

/** Something important appearing at the top of a page. */
export const banner: Variants = {
  hidden: { opacity: 0, y: -8 },
  visible: { opacity: 1, y: 0, transition: SETTLED },
  exit: { opacity: 0, y: -8, transition: QUICK },
};

/**
 * A row arriving in a live feed.
 *
 * No stagger. These arrive one at a time as things happen, so a delay computed
 * from list position would make the newest item wait behind items already on
 * screen — and re-animate the whole feed every time one arrives.
 */
export const feedItem: Variants = {
  hidden: { opacity: 0, x: -8 },
  visible: { opacity: 1, x: 0, transition: SETTLED },
  exit: { opacity: 0, x: 8, transition: QUICK },
};

/**
 * Cards on first paint.
 *
 * Staggered, but only just: 40ms apart across four cards finishes in under a
 * fifth of a second. The brief's 100ms plus a 200ms lead-in means the fourth
 * card lands after six hundred milliseconds, which is long enough to feel like
 * the page is loading slowly rather than arriving deliberately.
 */
export const cardGrid: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04 } },
};

export const card: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: SETTLED },
};

/** Pressed state for buttons — the one motion that confirms a tap landed. */
export const tap = { scale: 0.97 };

/** A section arriving below the fold, or a tab panel being switched to. */
export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: SETTLED },
  exit: { opacity: 0, y: -8, transition: QUICK },
};

/** Something entering from the side — a panel, a drawer, a sidebar item. */
export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -16 },
  visible: { opacity: 1, x: 0, transition: SETTLED },
};

/**
 * A figure that should read as landing rather than fading.
 *
 * A spring, but a stiff and well-damped one. The brief's stiffness 100 /
 * damping 10 overshoots visibly and wobbles back — fine for a toy, wrong for a
 * number somebody is trying to read. This settles without a second bounce.
 */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.94 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { type: 'spring', stiffness: 320, damping: 30, mass: 0.8 },
  },
};

/**
 * Hover lift for a card.
 *
 * Not a variant: this goes on whileHover, and it deliberately carries no
 * shadow. The panel has a light theme, where a heavy black drop shadow reads
 * as grime rather than elevation. The border brightens in CSS instead, which
 * works in both themes.
 */
export const lift = { y: -3, transition: QUICK };
