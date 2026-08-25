'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

/**
 * The day laid out as a timeline, one row per slot.
 *
 * Reads the routine each age group already carries. The stored entry is only a
 * time and an activity — there is no description column and no icon — so the
 * icon is derived from the activity text and the expanded row shows the
 * activity in full rather than invented copy. When descriptions exist one day,
 * they go in `detail` and the expansion has more to say without this changing.
 */

export interface RoutineSlot {
  time: string;
  activity: string;
  /** Not stored yet; rendered when present. */
  detail?: string;
}

/**
 * Emoji by keyword, first match wins, so the order here matters: "breakfast"
 * has to beat "play" for "Breakfast & free play".
 */
const ICONS: readonly [RegExp, string][] = [
  [/arrival|drop.?off|welcome|greet/i, '🚗'],
  [/pick.?up|home time|collect|depart/i, '🚪'],
  [/breakfast/i, '🥣'],
  [/lunch/i, '🍽️'],
  [/snack|feeding|bottle/i, '🍎'],
  [/nap|sleep|rest|quiet/i, '😴'],
  [/story|reading|book/i, '📚'],
  [/music|sing|movement|dance/i, '🎵'],
  [/art|craft|paint|draw|creative/i, '🎨'],
  [/outdoor|garden|playground|nature/i, '🌳'],
  [/sensory|tummy time|explor/i, '🧸'],
  [/circle|group time|morning meeting/i, '⭕'],
  [/wash|nappy|nappies|hygiene|tidy/i, '🧼'],
  [/language|literacy|phonics|number|math|learn/i, '✏️'],
  [/sport|physical|gross motor/i, '⚽'],
];

function iconFor(activity: string): string {
  for (const [pattern, emoji] of ICONS) if (pattern.test(activity)) return emoji;
  // Everything unmatched is some form of play, which is most of a nursery day.
  return '🧩';
}

export function DailyRoutineTimeline({
  slots,
  className = '',
}: {
  slots: readonly RoutineSlot[];
  className?: string;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const reduced = useReducedMotion();

  if (slots.length === 0) return null;

  return (
    <ol className={`relative space-y-1 ${className}`}>
      {/* The line the markers sit on. Behind them, and stopping short of the
          last row so it does not dangle past the final marker. */}
      <span
        className="absolute left-[1.35rem] top-6 bottom-6 w-px bg-blue-100 md:left-[1.6rem]"
        aria-hidden="true"
      />

      {slots.map((slot, index) => {
        const open = openIndex === index;
        return (
          <li key={`${slot.time}-${slot.activity}`} className="relative">
            <button
              type="button"
              onClick={() => setOpenIndex(open ? null : index)}
              aria-expanded={open}
              className={`flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors md:gap-4 md:px-3 ${
                open ? 'bg-blue-50' : 'md:hover:bg-gray-50'
              } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-800`}
            >
              <span
                className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg ring-4 ring-white transition-transform md:h-10 md:w-10 md:text-xl ${
                  open ? 'bg-blue-100 scale-110' : 'bg-gray-100'
                }`}
                aria-hidden="true"
              >
                {iconFor(slot.activity)}
              </span>
              <span className="w-12 shrink-0 text-sm font-bold text-blue-800 md:w-14">
                {slot.time}
              </span>
              <span className="flex-1 text-base text-gray-700">{slot.activity}</span>
              <span
                className={`shrink-0 text-xs text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
                aria-hidden="true"
              >
                ▾
              </span>
            </button>

            <AnimatePresence initial={false}>
              {open && (
                <motion.div
                  // Height rather than opacity alone, so the rows below move
                  // out of the way rather than being overlapped.
                  initial={reduced ? false : { height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <p className="py-2 pl-14 pr-3 text-sm leading-relaxed text-gray-600 md:pl-18">
                    {slot.detail ?? `${slot.activity} — from ${slot.time}.`}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </li>
        );
      })}
    </ol>
  );
}

export default DailyRoutineTimeline;
