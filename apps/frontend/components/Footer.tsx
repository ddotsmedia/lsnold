'use client';

import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import { useFooter, lines } from '../lib/footer';

interface FooterLink {
  label: string;
  href: string;
}

interface SocialLink {
  label: string;
  href: string;
  path: string;
  color: string;
}

/**
 * Contact details now come from admin -> Footer via useFooter(). The hook's
 * DEFAULT_FOOTER holds these same values, so an unreachable backend leaves the
 * footer reading exactly as it did before.
 */

const VISIT_US = ['Little Smarties Nursery LLC,', 'Khalifa City (A)', 'Abu Dhabi, UAE'];

const LINKS: readonly FooterLink[] = [
  { label: 'Facilities', href: '/facilities' },
  { label: 'Age Group', href: '/age-groups' },
  { label: 'Parents', href: '/nursery' },
  { label: 'Register', href: '/register' },
];

const ABOUT_LINKS: readonly FooterLink[] = [
  { label: 'Nursery', href: '/nursery' },
  { label: 'Contact', href: '/contact' },
  { label: 'Events', href: '/events' },
];

const PROGRAM_LINKS: readonly FooterLink[] = [
  { label: 'Infant Care', href: '/nursery#infant-care' },
  { label: 'Toddler Program', href: '/nursery#toddler-program' },
  { label: 'Preschool', href: '/nursery#preschool' },
  { label: 'Pre-K', href: '/nursery#pre-k' },
];

const QUICK_LINKS = LINKS;

/** Replace `#` with the real profile URLs once they are confirmed. */
const SOCIAL_LINKS: readonly SocialLink[] = [
  {
    label: 'Facebook',
    href: '#',
    color: 'bg-blue-600',
    path: 'M13.5 21v-7.5h2.5l.4-2.9h-2.9V8.7c0-.84.23-1.41 1.44-1.41h1.54V4.69c-.27-.04-1.18-.12-2.24-.12-2.22 0-3.74 1.36-3.74 3.85v2.15H8v2.9h2.5V21z',
  },
  {
    label: 'Instagram',
    href: '#',
    color: 'bg-pink-500',
    path: 'M12 7.4a4.6 4.6 0 100 9.2 4.6 4.6 0 000-9.2zm0 7.6a3 3 0 110-6 3 3 0 010 6zm5.8-7.8a1.07 1.07 0 11-2.14 0 1.07 1.07 0 012.14 0zM12 3.6c-2.28 0-2.56.01-3.46.05-.9.04-1.51.18-2.05.39a4.1 4.1 0 00-1.49.97c-.44.44-.72.88-.97 1.49-.2.54-.35 1.15-.39 2.05C3.6 9.44 3.6 9.72 3.6 12s.01 2.56.05 3.46c.04.9.18 1.51.39 2.05.21.61.53 1.05.97 1.49.44.44.88.72 1.49.97.54.2 1.15.35 2.05.39.9.04 1.18.05 3.46.05s2.56-.01 3.46-.05c.9-.04 1.51-.18 2.05-.39a4.1 4.1 0 001.49-.97c.44-.44.72-.88.97-1.49.2-.54.35-1.15.39-2.05.04-.9.05-1.18.05-3.46s-.01-2.56-.05-3.46c-.04-.9-.18-1.51-.39-2.05a4.1 4.1 0 00-.97-1.49 4.1 4.1 0 00-1.49-.97c-.54-.2-1.15-.35-2.05-.39-.9-.04-1.18-.05-3.46-.05zm0 1.62c2.24 0 2.5.01 3.39.05.82.04 1.26.17 1.56.29.39.15.67.33.96.62.29.29.47.57.62.96.12.3.25.74.29 1.56.04.89.05 1.15.05 3.39s-.01 2.5-.05 3.39c-.04.82-.17 1.26-.29 1.56-.15.39-.33.67-.62.96-.29.29-.57.47-.96.62-.3.12-.74.25-1.56.29-.89.04-1.15.05-3.39.05s-2.5-.01-3.39-.05c-.82-.04-1.26-.17-1.56-.29a2.6 2.6 0 01-.96-.62 2.6 2.6 0 01-.62-.96c-.12-.3-.25-.74-.29-1.56-.04-.89-.05-1.15-.05-3.39s.01-2.5.05-3.39c.04-.82.17-1.26.29-1.56.15-.39.33-.67.62-.96.29-.29.57-.47.96-.62.3-.12.74-.25 1.56-.29.89-.04 1.15-.05 3.39-.05z',
  },
  {
    label: 'LinkedIn',
    href: '#',
    color: 'bg-blue-700',
    path: 'M6.94 8.5H4.06V20h2.88V8.5zM5.5 3.9a1.67 1.67 0 100 3.34 1.67 1.67 0 000-3.34zM20 13.72c0-3.1-1.66-4.54-3.87-4.54-1.78 0-2.58.98-3.02 1.67V8.5H10.2c.04.81 0 11.5 0 11.5h2.9v-6.42c0-.26.02-.52.1-.7.2-.52.68-1.06 1.48-1.06 1.05 0 1.47.8 1.47 1.96V20H20v-6.28z',
  },
  {
    label: 'TikTok',
    href: '#',
    color: 'bg-gray-900',
    path: 'M16.6 5.82A4.28 4.28 0 0115.54 3h-3.09v12.4a2.59 2.59 0 01-2.59 2.5 2.59 2.59 0 01-2.59-2.59 2.59 2.59 0 013.17-2.53v-3.13a5.71 5.71 0 00-.58-.03A5.71 5.71 0 004.15 15.3 5.71 5.71 0 009.86 21a5.71 5.71 0 005.71-5.71V9.01a7.35 7.35 0 004.28 1.37V7.29a4.28 4.28 0 01-3.25-1.47z',
  },
  {
    label: 'Snapchat',
    href: '#',
    color: 'bg-yellow-400',
    path: 'M12 3.2c2.35 0 4.2 1.9 4.2 4.25 0 .77-.05 1.5-.1 2.06.28.15.62.2.95.1.5-.15.93.2.99.6.06.4-.22.7-.72.9-.5.2-1.2.36-1.3.68-.08.25.1.6.4 1.05.62.94 1.6 1.87 2.72 2.16.34.09.5.33.44.62-.09.44-.79.73-1.72.88-.14.02-.24.2-.3.5-.05.24-.1.5-.28.6-.2.1-.5.05-.9-.03a4.2 4.2 0 00-1.9.05c-.4.13-.76.42-1.15.72-.53.4-1.13.86-2.03.86s-1.5-.46-2.03-.86c-.39-.3-.75-.59-1.15-.72a4.2 4.2 0 00-1.9-.05c-.4.08-.7.13-.9.03-.18-.1-.23-.36-.28-.6-.06-.3-.16-.48-.3-.5-.93-.15-1.63-.44-1.72-.88-.06-.29.1-.53.44-.62 1.12-.29 2.1-1.22 2.72-2.16.3-.45.48-.8.4-1.05-.1-.32-.8-.48-1.3-.68-.5-.2-.78-.5-.72-.9.06-.4.49-.75.99-.6.33.1.67.05.95-.1-.05-.56-.1-1.29-.1-2.06C7.8 5.1 9.65 3.2 12 3.2z',
  },
];

/** Platform -> icon artwork. Labels double as the platform key. */
const ICON_BY_PLATFORM = new Map<string, SocialLink>(
  SOCIAL_LINKS.map((s) => [s.label.toLowerCase(), s])
);

/** Shown for platforms with no bespoke artwork yet (twitter, youtube, whatsapp). */
const GENERIC_ICON =
  'M12 2a10 10 0 100 20 10 10 0 000-20zm6.9 9h-3a15.5 15.5 0 00-1-5.1A8 8 0 0118.9 11zM12 4c.8 1.2 1.6 3.2 1.8 7h-3.6c.2-3.8 1-5.8 1.8-7zM5.1 11a8 8 0 014-5.1 15.5 15.5 0 00-1 5.1zm0 2h3a15.5 15.5 0 001 5.1 8 8 0 01-4-5.1zM12 20c-.8-1.2-1.6-3.2-1.8-7h3.6c-.2 3.8-1 5.8-1.8 7zm2.9-.9a15.5 15.5 0 001-5.1h3a8 8 0 01-4 5.1z';

interface DbSocialLink {
  id: string;
  platform: string;
  url: string;
  display_order: number;
}

function FooterLinkList({ title, links }: { title: string; links: readonly FooterLink[] }) {
  return (
    <div>
      <h3 className="mb-4 text-base font-semibold text-white">{title}</h3>
      <ul className="space-y-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="rounded text-sm text-blue-200/80 transition-colors duration-200 ease-in-out hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Cached for the tab's lifetime: the footer renders on every page. */
let socialCache: DbSocialLink[] | null = null;

export default function Footer() {
  const footer = useFooter();
  const emails = lines(footer.email);
  const hours = lines(footer.hours);
  const address = lines(footer.address);
  // The map follows the edited address, so correcting it in admin moves the pin.
  const mapQuery = encodeURIComponent(address.join(', '));
  const [socials, setSocials] = useState<DbSocialLink[]>(socialCache ?? []);

  useEffect(() => {
    if (socialCache) return;
    let cancelled = false;
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/social-links`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((rows: DbSocialLink[]) => {
        if (cancelled || !Array.isArray(rows)) return;
        socialCache = rows;
        setSocials(rows);
      })
      // Backend unreachable: show no icons rather than dead links.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <footer className="bg-blue-700 text-blue-100/90">
      <div className="mx-auto max-w-6xl px-4 py-10 md:px-6 md:py-12 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-white text-lg">
            {footer.logo_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={footer.logo_url}
                alt={footer.company_name}
                className="h-full w-full object-contain"
              />
            ) : (
              '🐣'
            )}
          </div>
          <h2 className="font-display text-2xl text-white">{footer.company_name}</h2>
        </div>

        {/* Contact card + map */}
        <div className="mt-6 grid grid-cols-1 gap-6 overflow-hidden rounded-2xl bg-blue-600/60 p-6 lg:grid-cols-2">
          <address className="space-y-3 text-sm not-italic">
            {emails.length > 0 && (
              <p>
                {emails.map((email, idx) => (
                  <span key={email}>
                    <a href={`mailto:${email}`} className="transition-colors hover:text-white">
                      {email}
                    </a>
                    {idx < emails.length - 1 && <br />}
                  </span>
                ))}
              </p>
            )}
            {footer.phone && (
              <p>
                <a
                  href={`tel:${footer.phone.replace(/\s/g, '')}`}
                  className="transition-colors hover:text-white"
                >
                  {footer.phone}
                </a>
              </p>
            )}
            {hours.length > 0 && (
              <p>
                {hours.map((line) => (
                  <span key={line}>
                    {line}
                    <br />
                  </span>
                ))}
              </p>
            )}
            {address.length > 0 && (
              <p>
                {address.map((line) => (
                  <span key={line}>
                    {line}
                    <br />
                  </span>
                ))}
              </p>
            )}
          </address>

          {/* Without an address the embed would resolve to an arbitrary place,
              so it is dropped rather than shown pointing somewhere wrong. */}
          {address.length > 0 && (
            <div className="overflow-hidden rounded-xl">
              <iframe
                title={`${footer.company_name} location`}
                src={`https://www.google.com/maps?q=${mapQuery}&output=embed`}
                className="h-56 w-full border-0 lg:h-full"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          )}
        </div>

        <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <h3 className="mb-4 text-base font-semibold text-white">Visit Us</h3>
            <p className="text-sm">
              {VISIT_US.map((line) => (
                <span key={line}>
                  {line}
                  <br />
                </span>
              ))}
            </p>
          </div>

          <FooterLinkList title="Links" links={LINKS} />
          <FooterLinkList title="About" links={ABOUT_LINKS} />

          {socials.length > 0 && (
            <div>
              <h3 className="mb-4 text-base font-semibold text-white">Follow Us</h3>
              <ul className="flex flex-wrap gap-2.5">
                {socials.map((social) => {
                  const icon = ICON_BY_PLATFORM.get(social.platform);
                  const label = icon?.label ?? social.platform;
                  return (
                    <li key={social.id}>
                      <a
                        href={social.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${label} (opens in a new tab)`}
                        className={`inline-flex h-11 w-11 items-center justify-center rounded-full text-white shadow-md transition-transform hover:scale-110 ${icon?.color ?? 'bg-gray-700'}`}
                      >
                        <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <path d={icon?.path ?? GENERIC_ICON} />
                        </svg>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-6 text-center text-sm text-blue-200/70 sm:flex-row sm:text-left">
          <p>&copy; 2026 Little Smarties Nursery School. All rights reserved.</p>
          <Link href="/terms" className="transition-colors hover:text-white">
            Terms &amp; Conditions
          </Link>
        </div>
      </div>
    </footer>
  );
}

export { Footer, PROGRAM_LINKS, QUICK_LINKS, ABOUT_LINKS, SOCIAL_LINKS };
