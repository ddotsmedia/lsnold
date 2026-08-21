import React, { type ReactNode } from 'react';

/** The three the page ships with. Kept for callers that still narrow to them. */
export type MissionCardTitle = 'Mission' | 'Vision' | 'Values';
export type MissionCardColor = 'red' | 'blue' | 'green';

export interface MissionCardProps {
  icon: string;
  /** A plain string: it renders inside the card's own <h3>. An admin override
      is resolved to text by the caller rather than passed as an element, since
      a <div> from EditableProse cannot legally nest inside a heading. */
  title: string;
  /** A node, so the caller can pass <EditableProse> in place of the built-in
      copy. It renders inside a <p>. */
  content: ReactNode;
  color: MissionCardColor;
  className?: string;
}

const cx = (...classes: Array<string | false | undefined>): string =>
  classes.filter(Boolean).join(' ');

/**
 * Tailwind resolves class names statically, so the colour variants have to be
 * spelled out in a lookup rather than interpolated from the `color` prop.
 */
const COLOR_CLASSES: Record<MissionCardColor, { surface: string; accent: string }> = {
  red: { surface: 'bg-red-50 border-red-100', accent: 'text-red-600' },
  blue: { surface: 'bg-blue-50 border-blue-100', accent: 'text-blue-800' },
  green: { surface: 'bg-green-50 border-green-100', accent: 'text-green-700' },
};

export function MissionCard({ icon, title, content, color, className }: MissionCardProps) {
  const palette = COLOR_CLASSES[color];

  return (
    <article
      className={cx(
        'flex h-full flex-col items-center rounded-lg border p-6 text-center shadow-md',
        'transition-all duration-200 ease-in-out hover:shadow-lg',
        palette.surface,
        className,
      )}
    >
      <span className="mb-4 text-4xl md:text-5xl" aria-hidden="true">
        {icon}
      </span>
      <h3 className={cx('mb-3 text-xl font-bold md:text-2xl', palette.accent)}>{title}</h3>
      {/* A div, not a p: an admin override arrives as a <div class="page-content">
          from EditableProse, and a div inside a p is invalid markup that the
          browser silently reparents. The classes are unchanged, so it looks the
          same either way. */}
      <div className="text-base leading-relaxed text-gray-700">{content}</div>
    </article>
  );
}

export default MissionCard;
