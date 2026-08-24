'use client';

import { usePhone } from '../lib/footer';
import { WhatsAppIcon } from './WhatsAppContact';

/**
 * Inline "Chat on WhatsApp" button, for placing beside a form.
 *
 * Distinct from WhatsAppContact, which is the fixed corner shortcut mounted in
 * the root layout. This one sits in the flow of a page, at the moment someone
 * has just filled in — or given up on — a form.
 *
 * The number comes from admin -> Footer through usePhone(), so it is the same
 * one the footer, the contact page and every call-us message use.
 */

export interface WhatsAppCTAProps {
  /**
   * Pre-filled first message. Written from the visitor's side, since it is
   * their message — "I'd like to book a tour", not "Tour booking enquiry".
   */
  message?: string;
  label?: string;
  /** Sub-label under the button, e.g. "We usually reply within an hour." */
  hint?: string;
  className?: string;
  /** Full width, for dropping under a form on mobile. */
  block?: boolean;
}

export function WhatsAppCTA({
  message,
  label = 'Chat on WhatsApp',
  hint,
  className,
  block = false,
}: WhatsAppCTAProps) {
  const phone = usePhone();
  // wa.me wants digits only — no +, spaces or dashes.
  const dial = phone.replace(/[^\d]/g, '');
  const href = message
    ? `https://wa.me/${dial}?text=${encodeURIComponent(message)}`
    : `https://wa.me/${dial}`;

  return (
    <div className={className}>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={[
          'inline-flex min-h-12 items-center justify-center gap-2.5 rounded-full',
          'bg-[#25D366] px-6 font-bold text-white shadow-md',
          'transition-transform duration-200 hover:scale-105 hover:bg-[#1ebe5b]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366] focus-visible:ring-offset-2',
          block ? 'w-full' : '',
        ].filter(Boolean).join(' ')}
      >
        <WhatsAppIcon />
        {label}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
      {hint && <p className="mt-2 text-center text-sm text-gray-600">{hint}</p>}
    </div>
  );
}

export default WhatsAppCTA;
