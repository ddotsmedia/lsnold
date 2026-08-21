'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { usePhone } from '../lib/footer';

export interface WhatsAppContactProps {
  /** Digits only, international format, no plus. */
  phoneNumber?: string;
  /** Human-readable version shown on the button. */
  displayNumber?: string;
  className?: string;
}

const cx = (...classes: Array<string | false | undefined>): string =>
  classes.filter(Boolean).join(' ');

function WhatsAppIcon() {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.95 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.14-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35z" />
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 004.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0012.04 2zm0 18.13h-.01a8.23 8.23 0 01-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 01-1.26-4.36c0-4.54 3.7-8.23 8.25-8.23a8.2 8.2 0 015.83 2.42 8.18 8.18 0 012.41 5.82c0 4.54-3.7 8.23-8.24 8.23z" />
    </svg>
  );
}

/**
 * Fixed WhatsApp shortcut. Sits top-right so it never collides with the chat
 * widget in the bottom-right corner.
 *
 * The number is rendered as a real `wa.me` link rather than a scripted click,
 * so it still works with JavaScript disabled and can be copied or opened in a
 * new tab by the visitor's own choice.
 */
export function WhatsAppContact({
  phoneNumber,
  displayNumber,
  className,
}: WhatsAppContactProps) {
  const pathname = usePathname();
  // Defaults come from admin -> Footer rather than a default parameter: a
  // parameter default cannot call a hook, and hardcoding one here would put the
  // number back in a second place. Props still win where a caller passes them.
  const footerPhone = usePhone();
  const display = displayNumber ?? footerPhone;
  const dial = phoneNumber ?? footerPhone.replace(/[^\d]/g, '');

  // Mounted from the root layout, which also wraps /admin. Staff working in the
  // panel should not have a visitor-facing button floating over their toolbar.
  if (pathname?.startsWith('/admin')) return null;

  return (
    <a
      href={`https://wa.me/${dial}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Chat with us on WhatsApp at ${display} (opens in a new tab)`}
      className={cx(
        'fixed right-4 top-20 z-40 inline-flex min-h-11 items-center gap-2 rounded-full',
        'bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-lg',
        'transition-all duration-200 ease-in-out hover:scale-105 hover:bg-green-700',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700',
        'focus-visible:ring-offset-2 md:right-6',
        className,
      )}
    >
      <WhatsAppIcon />
      {/* The number is extra reassurance on wide screens; the icon carries it on mobile */}
      <span className="hidden sm:inline">{display}</span>
      <span className="sm:hidden">WhatsApp</span>
    </a>
  );
}

export default WhatsAppContact;
