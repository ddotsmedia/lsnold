'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useSkipAnimation } from '../lib/useIsMobile';
import type { StaffMember } from '../lib/staff';

/**
 * The team as tinted cards.
 *
 * Replaces TeamMemberCard in the section /nursery already had, rather than
 * adding a second one — the same six people published twice is the duplication
 * this codebase has had to fix elsewhere.
 *
 * There is no fun-fact column on staff yet, so "Loves" is taken from the first
 * sentence of the bio and the rest follows it. When a column exists, `funFact`
 * below is where it goes and nothing else changes.
 */

const TINTS = [
  { from: '#e6f1fb', to: '#b9d6f2', ink: '#14395e', chip: '#c9e0f6' },
  { from: '#eaf3de', to: '#c8e0a6', ink: '#33511a', chip: '#d8ecbd' },
  { from: '#faede0', to: '#f6cf9e', ink: '#6b4109', chip: '#f8dfc0' },
  { from: '#fcebeb', to: '#f6c2c2', ink: '#6d1f1f', chip: '#f9d5d5' },
];

/** "SA" from "Sarah Ahmed", for the cards with no photograph. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const first = parts[0]?.charAt(0) ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0) ?? '') : '';
  return (first + last).toUpperCase();
}

/**
 * Splits a bio into its opening sentence and the remainder. The opening
 * sentence is what reads as the person's "thing", which is what the fun fact
 * slot wants until it has a column of its own.
 */
function splitBio(bio: string | null): { funFact: string | null; rest: string | null } {
  const text = (bio ?? '').trim();
  if (!text) return { funFact: null, rest: null };
  const match = text.match(/^(.+?[.!?])(\s+)(.*)$/s);
  if (!match) return { funFact: text, rest: null };
  return { funFact: match[1]!.trim(), rest: match[3]!.trim() || null };
}

export function StaffCards({
  staff,
  className = '',
}: {
  staff: readonly StaffMember[];
  className?: string;
}) {
  const reduced = useReducedMotion();
  const skip = useSkipAnimation(reduced);

  if (staff.length === 0) return null;

  return (
    <div
      className={`grid gap-6 sm:gap-8 ${className}`}
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))' }}
    >
      {staff.map((member, index) => {
        const tint = TINTS[index % TINTS.length]!;
        const { funFact, rest } = splitBio(member.bio);

        return (
          <motion.article
            key={member.id}
            className="flex h-full flex-col rounded-xl p-5 shadow-md md:p-6"
            style={{ backgroundImage: `linear-gradient(155deg, ${tint.from}, ${tint.to})` }}
            // Skipped below md and under reduced motion: a hover lift has no
            // meaning on a touch screen, and the entrance is the same fade the
            // rest of the site drops there.
            {...(skip
              ? {}
              : {
                  initial: { opacity: 0, y: 20 },
                  whileInView: { opacity: 1, y: 0 },
                  viewport: { once: true, amount: 0.15 },
                  transition: { duration: 0.5, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] as const },
                  whileHover: { y: -6, boxShadow: '0 16px 32px -12px rgb(0 0 0 / 0.28)' },
                })}
          >
            <div className="flex items-center gap-3">
              {member.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={member.photo_url}
                  alt={member.name}
                  className="h-16 w-16 shrink-0 rounded-full object-cover ring-2 ring-white/70"
                />
              ) : (
                <span
                  className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-lg font-bold ring-2 ring-white/70"
                  style={{ backgroundColor: tint.chip, color: tint.ink }}
                  aria-hidden="true"
                >
                  {initials(member.name)}
                </span>
              )}
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold md:text-lg" style={{ color: tint.ink }}>
                  {member.name}
                </h3>
                {member.role && (
                  <p className="truncate text-sm" style={{ color: tint.ink, opacity: 0.85 }}>
                    {member.role}
                  </p>
                )}
              </div>
            </div>

            {funFact && (
              <p className="mt-4 text-sm leading-relaxed" style={{ color: tint.ink }}>
                <span className="font-semibold">Loves: </span>
                {funFact}
              </p>
            )}
            {rest && (
              <p className="mt-2 text-sm leading-relaxed" style={{ color: tint.ink, opacity: 0.85 }}>
                {rest}
              </p>
            )}
          </motion.article>
        );
      })}
    </div>
  );
}

export default StaffCards;
