'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { formatIsoDate } from './DatePicker';
import { usePhone, telHref } from '../lib/footer';

/** Mirrors TIME_SLOTS in the bookings controller; the API rejects anything else. */
export const TIME_SLOTS = ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'] as const;
export type TimeSlot = (typeof TIME_SLOTS)[number];

export interface TimeSlotPickerProps {
  selectedDate: Date;
  selectedTime: string | null;
  onSelectTime: (time: TimeSlot) => void;
  className?: string;
}

interface AvailabilityResponse {
  date: string;
  available: string[];
  booked: string[];
}

const cx = (...classes: Array<string | false | undefined>): string =>
  classes.filter(Boolean).join(' ');

export function formatSlotLabel(slot: string): string {
  const [hourPart, minutePart] = slot.split(':');
  const hour = Number(hourPart ?? 0);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minutePart ?? '00'} ${suffix}`;
}

/**
 * Shows which of the six tour slots are free on the chosen date.
 *
 * Availability comes from the bookings API, which derives it from rows already
 * in `tour_bookings`. It is deliberately not generated on the client: a slot
 * shown as free that is actually taken sends the visitor into a 409 at the last
 * step, and a slot shown as taken that is actually free loses a booking.
 */
export function TimeSlotPicker({
  selectedDate,
  selectedTime,
  onSelectTime,
  className,
}: TimeSlotPickerProps) {
  const phone = usePhone();
  const [available, setAvailable] = useState<string[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const isoDate = formatIsoDate(selectedDate);

  const loadAvailability = useCallback(async (date: string, signal?: AbortSignal) => {
    setIsLoading(true);
    setLoadError(false);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/tour-bookings/availability?date=${date}`,
        { signal },
      );
      if (!response.ok) throw new Error('Availability lookup failed');
      const payload = (await response.json()) as AvailabilityResponse;
      setAvailable(Array.isArray(payload.available) ? payload.available : []);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setAvailable(null);
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadAvailability(isoDate, controller.signal);
    return () => controller.abort();
  }, [isoDate, loadAvailability]);

  if (isLoading) {
    return (
      <p className={cx('text-base text-gray-600', className)} role="status">
        Checking available times…
      </p>
    );
  }

  if (loadError) {
    return (
      <div className={cx('rounded-lg border border-amber-300 bg-amber-50 p-4', className)}>
        <p role="alert" className="text-sm text-amber-800">
          We couldn&rsquo;t check which times are free just now, so we can&rsquo;t take a booking
          for this date. Please try again, or call us on{' '}
          <a href={telHref(phone)} className="font-semibold underline">
            {phone}
          </a>
          .
        </p>
        <button
          type="button"
          onClick={() => void loadAvailability(isoDate)}
          className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-amber-600 px-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700"
        >
          Try again
        </button>
      </div>
    );
  }

  const freeSlots = available ?? [];

  return (
    <div className={className}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {TIME_SLOTS.map((slot) => {
          const isFree = freeSlots.includes(slot);
          const isSelected = selectedTime === slot;

          return (
            <button
              key={slot}
              type="button"
              disabled={!isFree}
              onClick={() => onSelectTime(slot)}
              aria-pressed={isSelected}
              aria-label={`${formatSlotLabel(slot)}, ${isFree ? 'available' : 'already booked'}`}
              className={cx(
                'flex min-h-11 flex-col items-center justify-center rounded-lg border-2 p-3',
                'transition-colors duration-200 ease-in-out focus-visible:outline-none',
                'focus-visible:ring-2 focus-visible:ring-blue-800',
                isSelected && 'border-red-600 bg-red-600 font-bold text-white',
                !isSelected && isFree && 'border-gray-300 bg-white hover:border-red-600 hover:bg-red-50',
                !isFree && 'cursor-not-allowed border-gray-200 bg-gray-200 text-gray-500',
              )}
            >
              <span className="text-base font-bold">{formatSlotLabel(slot)}</span>
              <span className={cx('text-xs', isSelected ? 'text-red-50' : 'text-gray-500')}>
                {isFree ? 'Available' : 'Booked'}
              </span>
            </button>
          );
        })}
      </div>

      {freeSlots.length === 0 && (
        <p className="mt-3 text-sm text-gray-600">
          Every slot on this date is taken. Please choose another day.
        </p>
      )}
      {freeSlots.length > 0 && !selectedTime && (
        <p className="mt-3 text-sm text-gray-600">Select a time slot above.</p>
      )}
    </div>
  );
}

export default TimeSlotPicker;
