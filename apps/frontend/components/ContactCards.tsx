'use client';

import { ScrollReveal } from './animations/ScrollReveal';
import { useFooter, lines } from '../lib/footer';

/**
 * The contact details as four tinted cards.
 *
 * Everything comes from admin → Footer, the same row the site footer reads, so
 * the page cannot publish a different phone number or address from the footer
 * — which it used to.
 *
 * A card whose field is empty is not rendered. An empty tile with a heading and
 * nothing under it reads as broken, and the grid closes up on its own.
 *
 * Animation goes through ScrollReveal rather than a motion.div here: it already
 * drops the wrapper entirely under prefers-reduced-motion and below md, and the
 * initial state is opacity 0, so a hand-rolled version that missed either would
 * leave the cards invisible for those visitors.
 */

interface CardStyle {
  /** Light to saturated, top-left to bottom-right. */
  from: string;
  to: string;
  /** Ink dark enough to hold contrast over the light end of the ramp. */
  ink: string;
}

const STYLES: Record<'phone' | 'email' | 'address' | 'hours', CardStyle> = {
  phone: { from: '#e6f1fb', to: '#85b7eb', ink: '#14395e' },
  email: { from: '#eaf3de', to: '#97c459', ink: '#33511a' },
  address: { from: '#faede0', to: '#ef9f27', ink: '#6b4109' },
  hours: { from: '#fcebeb', to: '#f09595', ink: '#6d1f1f' },
};

/** Each card reveals a little after the one before it. */
const STAGGER = 0.12;

interface CardData {
  key: keyof typeof STYLES;
  icon: string;
  title: string;
  content: readonly string[];
  linkText?: string;
  linkHref?: string;
}

export function ContactCards({ className = '' }: { className?: string }) {
  const footer = useFooter();
  const emails = lines(footer.email);
  const address = lines(footer.address);
  const hours = lines(footer.hours);

  const cards: CardData[] = [
    footer.phone?.trim() ? {
      key: 'phone' as const,
      icon: '📱',
      title: 'Phone',
      content: [footer.phone],
      linkText: 'Call us',
      linkHref: `tel:${footer.phone.replace(/\s/g, '')}`,
    } : null,
    emails.length > 0 ? {
      key: 'email' as const,
      icon: '✉️',
      title: 'Email',
      content: emails,
      linkText: 'Send an email',
      // The last address listed is the office one; the first is personal.
      linkHref: `mailto:${emails[emails.length - 1]}`,
    } : null,
    address.length > 0 ? {
      key: 'address' as const,
      icon: '📍',
      title: 'Address',
      content: address,
      linkText: 'Get directions',
      linkHref: `https://maps.google.com/?q=${encodeURIComponent(address.join(', '))}`,
    } : null,
    hours.length > 0 ? {
      key: 'hours' as const,
      icon: '🕒',
      title: 'Opening Hours',
      content: hours,
    } : null,
  ].filter(Boolean) as CardData[];

  if (cards.length === 0) return null;

  return (
    <div
      className={`grid gap-6 sm:gap-8 ${className}`}
      // auto-fit rather than a fixed column count, so a card dropping out for
      // want of a value re-lays the row instead of leaving a hole.
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(140px, 100%), 1fr))' }}
    >
      {cards.map((card, index) => {
        const style = STYLES[card.key];
        return (
          <ScrollReveal
            key={card.key}
            as="article"
            distance={20}
            duration={0.6}
            delay={index * STAGGER}
            amount={0.15}
            className="h-full"
          >
            {/* ScrollReveal takes no style prop, so the gradient lives on an
                inner element and this one only carries the animation. */}
            <div
              className="flex h-full flex-col rounded-xl p-5 shadow-md transition-shadow duration-200 md:p-6 md:hover:shadow-lg"
              style={{ backgroundImage: `linear-gradient(150deg, ${style.from}, ${style.to})` }}
            >
              <span className="mb-3 text-3xl md:text-4xl" aria-hidden="true">{card.icon}</span>
              <h3 className="text-base font-semibold md:text-lg" style={{ color: style.ink }}>
                {card.title}
              </h3>
              <div className="mt-1 flex-1 space-y-0.5">
                {card.content.map((line) => (
                  <p key={line} className="text-sm leading-relaxed break-words" style={{ color: style.ink }}>
                    {line}
                  </p>
                ))}
              </div>
              {card.linkHref && (
                <a
                  href={card.linkHref}
                  className="mt-4 inline-block text-sm font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                  style={{ color: style.ink }}
                  {...(card.key === 'address' ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                >
                  {card.linkText}
                </a>
              )}
            </div>
          </ScrollReveal>
        );
      })}
    </div>
  );
}

export default ContactCards;
