'use client';

import type { CSSProperties } from 'react';

/**
 * Handprint and footprint marks, for dividing sections and tinting the footer.
 *
 * Outlines rather than filled shapes: these sit behind and between real content
 * and a solid block of colour competes with it. `currentColor` throughout, so a
 * caller sets the colour with a text- class like every other decoration.
 *
 * Decorative only — aria-hidden, and never carrying text.
 */

interface PrintProps {
  className?: string;
  /** Scatter positions are data, so they arrive as inline style. */
  style?: CSSProperties;
}

/** An open hand: palm and five fingers. */
export function Handprint({ className, style }: PrintProps) {
  return (
    <svg viewBox="0 0 48 56" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden="true">
      <path d="M14 34c-2-5-4-9-6-12s1-6 4-3l4 5V9c0-3 4-3 4 0v14V6c0-3 4-3 4 0v17V8c0-3 4-3 4 0v15V12c0-3 4-3 4 0v20c0 9-4 16-12 16S15 41 14 34Z" />
    </svg>
  );
}

/** A foot: sole and five toes. */
export function Footprint({ className, style }: PrintProps) {
  return (
    <svg viewBox="0 0 40 56" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden="true">
      <path d="M11 26c-3-4-3-10-1-14s8-5 12-2 5 10 3 15c-1 3-1 6 0 9 2 5 1 12-5 13s-9-4-9-9c0-4 1-8 0-12Z" />
      <circle cx="27" cy="14" r="3" />
      <circle cx="31" cy="21" r="2.5" />
      <circle cx="33" cy="28" r="2" />
      <circle cx="33" cy="34" r="1.8" />
    </svg>
  );
}

/**
 * A row of prints between two sections.
 *
 * They alternate hand and foot and tilt in opposite directions, so the row
 * reads as something walked across the page rather than as a repeated stamp.
 */
const DIVIDER_TINTS = [
  'text-blue-300', 'text-green-300', 'text-amber-300', 'text-red-300', 'text-purple-300',
];

export function HandprintDivider({
  count = 5,
  className = '',
}: {
  /** How many prints. Trimmed to 3 below sm by the classes on each print. */
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center justify-center gap-3 py-6 sm:gap-6 md:py-10 ${className}`}
      aria-hidden="true"
    >
      {Array.from({ length: count }, (_, i) => {
        const Print = i % 2 === 0 ? Handprint : Footprint;
        return (
          <Print
            key={i}
            // The 4th and 5th are hidden on the narrowest screens, where five
            // prints across crowd out the gap between the sections they part.
            className={`h-7 w-7 sm:h-9 sm:w-9 ${DIVIDER_TINTS[i % DIVIDER_TINTS.length]} ${
              i >= 3 ? 'hidden sm:block' : ''
            } ${i % 2 === 0 ? 'rotate-[-12deg]' : 'rotate-[10deg]'}`}
          />
        );
      })}
    </div>
  );
}

/**
 * Prints scattered across a container, for use as a background.
 *
 * Absolutely positioned at fixed percentages rather than randomly: a random
 * layout would differ between the server render and the client one and trip
 * hydration, and it would also move on every navigation.
 */
const SCATTER = [
  { top: '8%', left: '4%', size: 'h-10 w-10', rotate: '-18deg', foot: false },
  { top: '55%', left: '13%', size: 'h-8 w-8', rotate: '12deg', foot: true },
  { top: '20%', left: '32%', size: 'h-9 w-9', rotate: '24deg', foot: true },
  { top: '70%', left: '46%', size: 'h-10 w-10', rotate: '-8deg', foot: false },
  { top: '12%', left: '62%', size: 'h-8 w-8', rotate: '16deg', foot: true },
  { top: '60%', left: '78%', size: 'h-11 w-11', rotate: '-22deg', foot: false },
  { top: '30%', left: '90%', size: 'h-9 w-9', rotate: '8deg', foot: true },
];

export function FooterHandprints({ className = '' }: { className?: string }) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden opacity-20 ${className}`}
      aria-hidden="true"
    >
      {SCATTER.map((mark, i) => {
        const Print = mark.foot ? Footprint : Handprint;
        return (
          <Print
            key={i}
            className={`absolute ${mark.size} ${i >= 4 ? 'hidden md:block' : ''}`}
            // Inline because the positions are data, and Tailwind cannot
            // resolve an interpolated class name.
            style={{ top: mark.top, left: mark.left, transform: `rotate(${mark.rotate})` }}
          />
        );
      })}
    </div>
  );
}
