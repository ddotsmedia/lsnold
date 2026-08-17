'use client';

import React from 'react';

export type AgeGroupColor = 'pink' | 'purple' | 'blue' | 'red' | 'green' | 'yellow';

export interface AgeGroupCardProps {
  emoji: string;
  /** Uploaded icon. Replaces the emoji when one has been set in the admin panel. */
  /** Photograph uploaded in admin -> Age Groups. */
  heroUrl?: string | null;
  heroAlt?: string | null;
  iconUrl?: string | null;
  iconAlt?: string | null;
  name: string;
  range: string;
  description: string;
  color: AgeGroupColor;
  onClick: () => void;
  /** Highlights the card whose detail is currently open. */
  isSelected?: boolean;
  /** id of the detail region this card reveals, for aria-controls. */
  controlsId?: string;
  className?: string;
}

const cx = (...classes: Array<string | false | undefined>): string =>
  classes.filter(Boolean).join(' ');

/**
 * Tailwind resolves class names statically, so each colour is spelled out
 * rather than interpolated from the `color` prop.
 */
const COLOR_CLASSES: Record<AgeGroupColor, { surface: string; ring: string; accent: string }> = {
  pink: { surface: 'bg-pink-50 border-pink-300', ring: 'ring-pink-400', accent: 'text-pink-700' },
  purple: {
    surface: 'bg-purple-50 border-purple-300',
    ring: 'ring-purple-400',
    accent: 'text-purple-700',
  },
  blue: { surface: 'bg-blue-50 border-blue-300', ring: 'ring-blue-400', accent: 'text-blue-800' },
  red: { surface: 'bg-red-50 border-red-300', ring: 'ring-red-400', accent: 'text-red-600' },
  green: {
    surface: 'bg-green-50 border-green-300',
    ring: 'ring-green-400',
    accent: 'text-green-700',
  },
  yellow: {
    surface: 'bg-yellow-50 border-yellow-300',
    ring: 'ring-yellow-400',
    accent: 'text-yellow-700',
  },
};

/**
 * Age group summary tile. The whole card is a single button — the "Click to
 * explore" line is an affordance, not a separate control — so pointer and
 * keyboard users share one target and one handler.
 */
export function AgeGroupCard({
  emoji,
  heroUrl,
  heroAlt,
  iconUrl,
  iconAlt,
  name,
  range,
  description,
  color,
  onClick,
  isSelected = false,
  controlsId,
  className,
}: AgeGroupCardProps) {
  const palette = COLOR_CLASSES[color];

  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={isSelected}
      aria-controls={controlsId}
      className={cx(
        'flex h-full w-full cursor-pointer flex-col rounded-lg border p-6 text-left shadow-md',
        'transition-all duration-200 ease-in-out hover:scale-105 hover:shadow-lg',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-800 focus-visible:ring-offset-2',
        palette.surface,
        isSelected && `ring-2 ring-offset-2 ${palette.ring}`,
        className,
      )}
    >
      {/* The photograph uploaded in the panel, when there is one. It is the
          subject of the card, so it leads; the icon or emoji stays as the
          small marker beside the name. */}
      {heroUrl && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={heroUrl}
          alt={heroAlt || ''}
          loading="lazy"
          className="mb-4 aspect-3/2 w-full rounded-xl object-cover"
        />
      )}

      {iconUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={iconUrl} alt={iconAlt || ''} className="mb-3 h-12 w-12 object-contain md:h-14 md:w-14" />
      ) : (
        // Hidden when a photograph is showing: an emoji under a real picture
        // reads as a placeholder that failed to load.
        !heroUrl && (
          <span className="mb-3 text-4xl md:text-5xl" aria-hidden="true">
            {emoji}
          </span>
        )
      )}

      <h3 className="text-xl font-bold text-gray-800 md:text-2xl">{name}</h3>
      <p className={cx('mt-1 text-base font-semibold md:text-lg', palette.accent)}>{range}</p>
      <p className="mt-3 text-sm leading-relaxed text-gray-700">{description}</p>

      <span
        className={cx('mt-auto pt-5 text-sm font-semibold', palette.accent)}
        aria-hidden="true"
      >
        {isSelected ? 'Showing details ↓' : 'Click to explore →'}
      </span>
    </button>
  );
}

export default AgeGroupCard;
