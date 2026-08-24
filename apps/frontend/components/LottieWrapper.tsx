'use client';

import dynamic from 'next/dynamic';
import { useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * Renders a Lottie animation.
 *
 * lottie-react pulls in lottie-web, a few hundred kilobytes, so it is loaded
 * through next/dynamic with ssr:false. That keeps it out of the shared bundle
 * and off the server render — the library reaches for `document` on mount and
 * would need guarding anyway.
 *
 * `.then(m => m.Lottie)`: lottie-react v3 has no default export, and
 * next/dynamic cannot pick a named component out of a module on its own.
 */
const Lottie = dynamic(() => import('lottie-react').then((m) => m.Lottie), {
  ssr: false,
  loading: () => null,
});

export interface LottieWrapperProps {
  /**
   * A URL to a Lottie JSON file, or the parsed JSON itself. The library
   * fetches a URL on its own, so there is no loading to manage here.
   */
  src: string | object;
  loop?: boolean;
  autoplay?: boolean;
  /** Sizing goes here. An animation fills its box, and a box with no height shows nothing. */
  className?: string;
  /**
   * Rendered instead of the animation when the visitor has asked for reduced
   * motion. A still image or an emoji works well.
   */
  fallback?: ReactNode;
  /** Describes the animation. Omit for pure decoration and it is hidden. */
  label?: string;
}

export function LottieWrapper({
  src,
  loop = true,
  autoplay = true,
  className,
  fallback = null,
  label,
}: LottieWrapperProps) {
  const reduced = useReducedMotion();

  const a11y = label
    ? { role: 'img' as const, 'aria-label': label }
    : { 'aria-hidden': true as const };

  // Nothing is fetched in this branch: the library never mounts, so a visitor
  // who has asked for reduced motion does not pay for the animation either.
  if (reduced) {
    return (
      <div className={className} {...a11y}>
        {fallback}
      </div>
    );
  }

  return <Lottie src={src} loop={loop} autoplay={autoplay} className={className} {...a11y} />;
}

export default LottieWrapper;
