import React from 'react';

export type SafetyCardColor = 'blue' | 'green' | 'red' | 'yellow' | 'purple';

export interface SafetyCardProps {
  icon: string;
  title: string;
  description: string;
  color: SafetyCardColor;
  className?: string;
}

const cx = (...classes: Array<string | false | undefined>): string =>
  classes.filter(Boolean).join(' ');

/**
 * Tailwind cannot resolve interpolated class names, so each tint is spelled out.
 */
const COLOR_CLASSES: Record<SafetyCardColor, { surface: string; accent: string }> = {
  blue: { surface: 'bg-blue-50 border-blue-100', accent: 'text-blue-800' },
  green: { surface: 'bg-green-50 border-green-100', accent: 'text-green-700' },
  red: { surface: 'bg-red-50 border-red-100', accent: 'text-red-600' },
  yellow: { surface: 'bg-yellow-50 border-yellow-100', accent: 'text-yellow-700' },
  purple: { surface: 'bg-purple-50 border-purple-100', accent: 'text-purple-700' },
};

export function SafetyCard({ icon, title, description, color, className }: SafetyCardProps) {
  const palette = COLOR_CLASSES[color];

  return (
    <article
      className={cx(
        'flex h-full flex-col rounded-lg border p-6 shadow-md md:p-8',
        'transition-shadow duration-200 ease-in-out hover:shadow-lg',
        palette.surface,
        className,
      )}
    >
      <span className="mb-4 text-4xl" aria-hidden="true">
        {icon}
      </span>
      <h3 className={cx('mb-2 text-xl font-semibold md:text-2xl', palette.accent)}>{title}</h3>
      <p className="text-sm leading-relaxed text-gray-700">{description}</p>
    </article>
  );
}

export default SafetyCard;
