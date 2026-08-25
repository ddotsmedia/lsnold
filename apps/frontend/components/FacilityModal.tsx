'use client';

import React, { useEffect, useRef } from 'react';
import { Modal } from './Modal';
import { cloudinaryResize, buildSrcSet, CARD_WIDTHS, CARD_SIZES } from '../lib/cloudinary';

export interface Facility {
  id: number;
  emoji: string;
  name: string;
  description: string;
  features: readonly string[];
  detailedDescription: string;
  amenities: readonly string[];
  images?: readonly string[];
}

export interface FacilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  facility: Facility | null;
  onPrevious: () => void;
  onNext: () => void;
  /** 1-based position, used for the "3 of 9" counter. */
  currentIndex?: number;
  total?: number;
}

/** Placeholder tints for the gallery tiles until real photography is supplied. */
const GALLERY_GRADIENTS: readonly string[] = [
  'from-blue-100 to-blue-200',
  'from-red-100 to-orange-100',
  'from-green-100 to-emerald-200',
  'from-purple-100 to-blue-100',
  'from-yellow-100 to-orange-100',
  'from-sky-100 to-cyan-200',
];

const SIDE_BUTTON_CLASSES =
  'fixed top-1/2 z-50 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full ' +
  'bg-white/70 text-gray-800 shadow-lg transition-all duration-200 ease-in-out ' +
  'hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-800 lg:flex';

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points={direction === 'left' ? '15 5 8 12 15 19' : '9 5 16 12 9 19'} />
    </svg>
  );
}

/**
 * Detailed facility view built on the shared Modal.
 *
 * Previous/Next are offered twice by design: as viewport-fixed side buttons on
 * large screens (they sit outside the panel, so they stay put while the body
 * scrolls) and as a footer row on smaller screens, where floating side buttons
 * would cover the content. Arrow keys work at every width.
 */
export function FacilityModal({
  isOpen,
  onClose,
  facility,
  onPrevious,
  onNext,
  currentIndex,
  total,
}: FacilityModalProps) {
  // Consumers pass inline arrows for these, so read them through refs to keep
  // the key handler effect from re-subscribing on every parent render.
  const onPreviousRef = useRef(onPrevious);
  const onNextRef = useRef(onNext);
  useEffect(() => {
    onPreviousRef.current = onPrevious;
    onNextRef.current = onNext;
  });

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        onPreviousRef.current();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        onNextRef.current();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  if (!facility) return null;

  const hasCounter = typeof currentIndex === 'number' && typeof total === 'number';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={facility.name} size="lg">
      {/* Lead image placeholder */}
      <div
        className="mb-6 flex aspect-3/2 w-full items-center justify-center rounded-lg bg-gradient-to-br from-blue-100 to-blue-200"
        role="img"
        aria-label={facility.name}
      >
        <span className="text-6xl md:text-7xl" aria-hidden="true">
          {facility.emoji}
        </span>
      </div>

      <p className="text-base leading-relaxed text-gray-700">{facility.detailedDescription}</p>

      <section aria-labelledby="facility-features-heading" className="mt-6">
        <h3 id="facility-features-heading" className="mb-3 text-lg font-semibold text-gray-800">
          Key Features
        </h3>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {facility.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-sm text-gray-700">
              <span className="mt-0.5 text-blue-500" aria-hidden="true">
                ✓
              </span>
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="facility-amenities-heading" className="mt-6">
        <h3 id="facility-amenities-heading" className="mb-3 text-lg font-semibold text-gray-800">
          Amenities
        </h3>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {facility.amenities.map((amenity) => (
            <li key={amenity} className="flex items-start gap-2 text-sm text-gray-700">
              <span className="mt-0.5 text-red-600" aria-hidden="true">
                •
              </span>
              <span>{amenity}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="facility-gallery-heading" className="mt-6">
        <h3 id="facility-gallery-heading" className="mb-3 text-lg font-semibold text-gray-800">
          Gallery
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {/* Real photographs once any have been uploaded for this facility in
              the admin panel; the tinted placeholders until then. */}
          {facility.images && facility.images.length > 0
            ? facility.images.map((src, index) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={src}
                  src={cloudinaryResize(src, 500, 375)}
                  srcSet={buildSrcSet(src, CARD_WIDTHS, { ratio: 3 / 4 })}
                  sizes="(max-width: 640px) calc(50vw - 24px), 240px"
                  alt={`${facility.name}, photo ${index + 1}`}
                  loading="lazy"
                  className="aspect-4/3 w-full rounded-lg object-cover"
                />
              ))
            : GALLERY_GRADIENTS.map((gradient, index) => (
                <div
                  key={gradient}
                  className={`aspect-4/3 rounded-lg bg-gradient-to-br ${gradient}`}
                  role="img"
                  aria-label={`${facility.name} photo ${index + 1} placeholder`}
                />
              ))}
        </div>
      </section>

      {/* Footer navigation — the only prev/next control below lg. */}
      <div className="mt-8 flex items-center justify-between gap-4 border-t border-gray-100 pt-4">
        <button
          type="button"
          onClick={onPrevious}
          aria-label="Previous facility"
          className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm font-semibold text-blue-800 transition-colors duration-200 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-800 lg:hidden"
        >
          <ChevronIcon direction="left" />
          Previous
        </button>

        {hasCounter && (
          <span className="text-sm text-gray-600" aria-live="polite">
            {currentIndex} of {total}
          </span>
        )}

        <button
          type="button"
          onClick={onNext}
          aria-label="Next facility"
          className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm font-semibold text-blue-800 transition-colors duration-200 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-800 lg:hidden"
        >
          Next
          <ChevronIcon direction="right" />
        </button>
      </div>

      {/* Viewport-edge navigation on large screens. */}
      <button
        type="button"
        onClick={onPrevious}
        aria-label="Previous facility"
        className={`${SIDE_BUTTON_CLASSES} left-4`}
      >
        <ChevronIcon direction="left" />
      </button>
      <button
        type="button"
        onClick={onNext}
        aria-label="Next facility"
        className={`${SIDE_BUTTON_CLASSES} right-4`}
      >
        <ChevronIcon direction="right" />
      </button>
    </Modal>
  );
}

export default FacilityModal;
