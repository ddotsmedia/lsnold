'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { CSSProperties } from 'react';
import {
  BouncingEmoji,
  FloatingEmoji,
  FloatingSideways,
  PulsingEmoji,
  SpinningEmoji,
  WiggleEmoji,
  type EmojiProps,
} from './EnhancedEmojis';

/**
 * Named presets, so a page places "a balloon" rather than wiring an emoji to a
 * motion variant every time. Each pairs a character with the movement that
 * actually suits it — balloons rise, clouds drift sideways, stars twinkle.
 *
 * All decoration, all hidden from assistive tech, all still under reduced
 * motion via the primitives they build on.
 */

type PresetProps = Omit<EmojiProps, 'emoji'>;

const hidden = { 'aria-hidden': true as const };

/** 🎈 Rises and sways, the way a balloon on a string does. */
export function Balloon(props: PresetProps) {
  return <FloatingSideways emoji="🎈" duration={5} {...props} />;
}

/** ⭐ Twinkles: scale and opacity together, so it reads as light not size. */
export function Star({ className, duration = 2, delay = 0, style }: PresetProps) {
  const reduced = useReducedMotion();
  if (reduced) return <span className={className} style={style} {...hidden}>⭐</span>;

  return (
    <motion.span
      className={className}
      style={style}
      {...hidden}
      animate={{ scale: [1, 1.35, 1], opacity: [0.65, 1, 0.65] }}
      transition={{ duration, delay, repeat: Infinity, ease: 'easeInOut' }}
    >
      ⭐
    </motion.span>
  );
}

/** 💖 Beats — a double pulse per cycle, like a heartbeat rather than a throb. */
export function Heart({ className, duration = 1.4, delay = 0, style }: PresetProps) {
  const reduced = useReducedMotion();
  if (reduced) return <span className={className} style={style} {...hidden}>💖</span>;

  return (
    <motion.span
      className={className}
      style={style}
      {...hidden}
      animate={{ scale: [1, 1.25, 1, 1.18, 1], y: [0, -8, 0, -4, 0] }}
      transition={{ duration, delay, repeat: Infinity, repeatDelay: 0.4, ease: 'easeInOut' }}
    >
      💖
    </motion.span>
  );
}

/** 😊 Wiggles and hops together. */
export function Smiley({ className, duration = 1.6, delay = 0, style }: PresetProps) {
  const reduced = useReducedMotion();
  if (reduced) return <span className={className} style={style} {...hidden}>😊</span>;

  return (
    <motion.span
      className={className}
      style={style}
      {...hidden}
      animate={{ rotate: [-6, 6, -6], y: [0, -14, 0] }}
      transition={{ duration, delay, repeat: Infinity, ease: 'easeInOut' }}
    >
      😊
    </motion.span>
  );
}

/** 🧸 Swings from a point above it, so the pivot is the top not the centre. */
export function Toy({ className, duration = 2.4, delay = 0, style }: PresetProps) {
  const reduced = useReducedMotion();
  if (reduced) return <span className={className} style={style} {...hidden}>🧸</span>;

  return (
    <motion.span
      className={className}
      style={{ transformOrigin: 'top center', ...style }}
      {...hidden}
      animate={{ rotate: [-12, 12, -12] }}
      transition={{ duration, delay, repeat: Infinity, ease: 'easeInOut' }}
    >
      🧸
    </motion.span>
  );
}

/** 🧱 Tumbles: a full turn with a hop at the same time. */
export function Block({ className, duration = 3, delay = 0, style }: PresetProps) {
  const reduced = useReducedMotion();
  if (reduced) return <span className={className} style={style} {...hidden}>🧱</span>;

  return (
    <motion.span
      className={className}
      style={style}
      {...hidden}
      animate={{ rotate: [0, 360], y: [0, -20, 0] }}
      transition={{ duration, delay, repeat: Infinity, ease: 'easeInOut' }}
    >
      🧱
    </motion.span>
  );
}

/** ☁️ Drifts slowly across, barely rising. Meant to sit behind everything. */
export function Cloud({ className, duration = 12, delay = 0, style }: PresetProps) {
  const reduced = useReducedMotion();
  if (reduced) return <span className={className} style={style} {...hidden}>☁️</span>;

  return (
    <motion.span
      className={className}
      style={style}
      {...hidden}
      animate={{ x: [0, 40, 0], y: [0, -8, 0] }}
      transition={{ duration, delay, repeat: Infinity, ease: 'easeInOut' }}
    >
      ☁️
    </motion.span>
  );
}

/** 🚀 Climbs and tilts, then resets. */
export function Rocket({ className, duration = 3.2, delay = 0, style }: PresetProps) {
  const reduced = useReducedMotion();
  if (reduced) return <span className={className} style={style} {...hidden}>🚀</span>;

  return (
    <motion.span
      className={className}
      style={style}
      {...hidden}
      animate={{ y: [0, -60, 0], rotate: [0, -12, 0] }}
      transition={{ duration, delay, repeat: Infinity, ease: 'easeInOut' }}
    >
      🚀
    </motion.span>
  );
}

/** 🎉 Bursts on arrival, then settles to a gentle wiggle. */
export function Party({ className, duration = 1.8, delay = 0, style }: PresetProps) {
  const reduced = useReducedMotion();
  if (reduced) return <span className={className} style={style} {...hidden}>🎉</span>;

  return (
    <motion.span
      className={className}
      style={style}
      {...hidden}
      initial={{ scale: 0.3, rotate: -25, opacity: 0 }}
      whileInView={{
        scale: [0.3, 1.4, 1],
        rotate: [-25, 10, 0],
        opacity: 1,
      }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration, delay, ease: [0.34, 1.56, 0.64, 1] }}
    >
      🎉
    </motion.span>
  );
}

/** 🌈 Shimmers — brightness and a slight tilt, no movement. */
export function Rainbow({ className, duration = 3, delay = 0, style }: PresetProps) {
  const reduced = useReducedMotion();
  if (reduced) return <span className={className} style={style} {...hidden}>🌈</span>;

  return (
    <motion.span
      className={className}
      style={style}
      {...hidden}
      animate={{ filter: ['brightness(1)', 'brightness(1.35)', 'brightness(1)'], rotate: [-3, 3, -3] }}
      transition={{ duration, delay, repeat: Infinity, ease: 'easeInOut' }}
    >
      🌈
    </motion.span>
  );
}

// Re-exported so a page can import the presets and the raw variants together.
export {
  BouncingEmoji,
  FloatingEmoji,
  FloatingSideways,
  PulsingEmoji,
  SpinningEmoji,
  WiggleEmoji,
};
