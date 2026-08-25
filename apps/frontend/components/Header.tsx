'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from './Button';
import { useSiteMedia } from '../lib/media';
import { useBranding } from '../lib/branding';
import { cloudinaryResize } from '../lib/cloudinary';

export interface NavLink {
  label: string;
  href: string;
}

export interface HeaderProps {
  /**
   * Route to highlight as active. Defaults to the current pathname, so pages
   * normally render `<Header />` with no props.
   */
  currentPage?: string;
}

/**
 * Only routes that exist under `app/` are linked here — "Parents" from the
 * original spec still has no page and so is still omitted.
 */
const NAV_LINKS: readonly NavLink[] = [
  { label: 'Home', href: '/' },
  { label: 'Nursery', href: '/nursery' },
  { label: 'Facilities', href: '/facilities' },
  { label: 'Age Groups', href: '/age-groups' },
  { label: 'Gallery', href: '/gallery' },
  { label: 'Events', href: '/events' },
  { label: 'Contact Us', href: '/contact' },
];

const MOBILE_MENU_ID = 'lsn-mobile-menu';

const cx = (...classes: Array<string | false | undefined>): string =>
  classes.filter(Boolean).join(' ');

function isActive(href: string, current: string): boolean {
  if (href === '/') return current === '/';
  return current === href || current.startsWith(`${href}/`);
}

function LogoMark() {
  return (
    <svg
      width={32}
      height={32}
      viewBox="0 0 32 32"
      className="shrink-0"
      role="img"
      aria-label="Little Smarties logo"
    >
      <circle cx="16" cy="16" r="15" className="fill-red-600" />
      <circle cx="11" cy="13" r="2.2" className="fill-white" />
      <circle cx="21" cy="13" r="2.2" className="fill-white" />
      <path
        d="M10 19c1.8 2.6 4 3.9 6 3.9s4.2-1.3 6-3.9"
        className="stroke-white"
        strokeWidth="2.4"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      {open ? (
        <>
          <line x1="5" y1="5" x2="19" y2="19" />
          <line x1="19" y1="5" x2="5" y2="19" />
        </>
      ) : (
        <>
          <line x1="4" y1="7" x2="20" y2="7" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="17" x2="20" y2="17" />
        </>
      )}
    </svg>
  );
}

export default function Header({ currentPage }: HeaderProps = {}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // An uploaded logo replaces the drawn mark. Until one exists — or if the
  // request fails — LogoMark renders exactly as before.
  const siteMedia = useSiteMedia();
  // Name and accent colour from admin -> Branding. Seeded with the current
  // values, so this renders identically until somebody changes them.
  const branding = useBranding();
  const logo = siteMedia.logo ?? null;

  const activePath = currentPage ?? pathname ?? '/';

  // Deepen the header shadow once the page has scrolled away from the top.
  useEffect(() => {
    const onScroll = (): void => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close the mobile menu whenever navigation completes.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  return (
    <header
      className={cx(
        'sticky top-0 z-40 w-full bg-white transition-shadow duration-200 ease-in-out',
        scrolled ? 'shadow-md' : 'shadow-sm',
      )}
    >
      <nav
        aria-label="Main navigation"
        className="mx-auto flex h-17.5 max-w-6xl items-center justify-between gap-4 px-4"
      >
        <Link
          href="/"
          className="flex items-center gap-2 rounded-lg text-lg font-bold text-blue-800 transition-colors duration-200 hover:text-blue-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-800 md:text-xl"
        >
          {logo ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            /* 32px tall, at most 140 wide. Bounded at 2x that width; the
               ladder a srcSet would offer has nothing to choose between. */
            <img
              src={cloudinaryResize(logo.url, 280)}
              alt={logo.alt_text || branding.site_name}
              className="h-8 w-auto max-w-35 object-contain"
            />
          ) : (
            <LogoMark />
          )}
          {/* The accent colour is applied inline because it is a value from the
              database, and Tailwind only ships classes it can see at build
              time — text-[#abc123] written at runtime produces no CSS. The
              class above still carries the hover and focus colours, so the
              link behaves the same either way. */}
          <span style={{ color: branding.primary_color }}>{branding.site_name}</span>
        </Link>

        {/* Desktop navigation */}
        <ul className="hidden items-center gap-5 lg:flex">
          {NAV_LINKS.map((link) => {
            const active = isActive(link.href, activePath);
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'text-sm font-semibold transition-colors duration-200 ease-in-out',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-800 rounded',
                    active ? 'text-red-600' : 'text-gray-800 hover:text-red-600',
                  )}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="hidden items-center gap-3 lg:flex">
          <Button href="/booking" variant="primary" size="sm">
            Book a Tour
          </Button>
          <Button href="/register" variant="secondary" size="sm">
            Register
          </Button>
        </div>

        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={menuOpen}
          aria-controls={MOBILE_MENU_ID}
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-800 transition-colors duration-200 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-800 lg:hidden"
        >
          <MenuIcon open={menuOpen} />
        </button>
      </nav>

      {/* Mobile navigation */}
      <div
        id={MOBILE_MENU_ID}
        hidden={!menuOpen}
        className="border-t border-gray-200 bg-white shadow-md lg:hidden"
      >
        <ul className="mx-auto flex max-w-6xl flex-col px-4 py-2">
          {NAV_LINKS.map((link) => {
            const active = isActive(link.href, activePath);
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'flex min-h-11 items-center rounded-lg px-2 text-base font-semibold',
                    'transition-colors duration-200 ease-in-out focus-visible:outline-none',
                    'focus-visible:ring-2 focus-visible:ring-blue-800',
                    active ? 'text-red-600' : 'text-gray-800 hover:bg-gray-100 hover:text-red-600',
                  )}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 pb-4 pt-2">
          <Button href="/booking" variant="primary" size="md" fullWidth>
            Book a Tour
          </Button>
          <Button href="/register" variant="secondary" size="md" fullWidth>
            Register
          </Button>
        </div>
      </div>
    </header>
  );
}

export { Header, NAV_LINKS };
