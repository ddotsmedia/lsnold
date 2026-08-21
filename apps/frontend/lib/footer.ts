'use client';

import { useEffect, useState } from 'react';

/**
 * The footer's company name, logo and contact details, as set in admin -> Footer.
 *
 * Reads the public endpoint, not the admin one: the footer renders on every
 * visitor-facing page and a visitor holds no token, so /admin/footer would
 * answer 401 and the address would never arrive.
 *
 * email, address and hours come back as newline-separated lists. `lines()`
 * splits them for rendering; blanks are dropped so a stray trailing newline in
 * the editor does not leave an empty row in the footer.
 */

const API = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1';

export interface SiteFooter {
  company_name: string;
  logo_url: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  hours: string | null;
}

/**
 * What the footer says today.
 *
 * Used as the initial state rather than something empty, so the first paint is
 * already correct and the fetch only changes anything if somebody has actually
 * edited it. An empty default would blank the contact details for a moment on
 * every page load.
 */
export const DEFAULT_FOOTER: SiteFooter = {
  company_name: 'Little Smarties',
  logo_url: null,
  phone: '+971 56 267 7747',
  email: 'lsnmoj@gmail.com\ninfo@lsn.ae',
  address:
    'Ministry Of Justice Ground Floor, Khalifa City (A)\n' +
    'Sector 133, Street 12, P.O. Box 260\n' +
    'Abu Dhabi United Arab Emirates',
  hours: 'Mon – Fri: 7:00 – 18:00\nWeekends: Closed',
};

/** Cached for the tab's lifetime: the footer renders on every page. */
let cache: SiteFooter | null = null;

/** Splits a newline-separated column into renderable lines. */
export function lines(value: string | null): string[] {
  if (!value) return [];
  return value.split('\n').map((l) => l.trim()).filter(Boolean);
}

export function useFooter(): SiteFooter {
  const [footer, setFooter] = useState<SiteFooter>(cache ?? DEFAULT_FOOTER);

  useEffect(() => {
    if (cache) return;
    let cancelled = false;

    fetch(`${API}/footer`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((data: Partial<SiteFooter>) => {
        if (cancelled || !data || typeof data !== 'object') return;
        // Field by field, so a row missing a column cannot blank the footer.
        const next: SiteFooter = {
          company_name: data.company_name || DEFAULT_FOOTER.company_name,
          logo_url: data.logo_url ?? null,
          phone: data.phone ?? null,
          email: data.email ?? null,
          address: data.address ?? null,
          hours: data.hours ?? null,
        };
        cache = next;
        setFooter(next);
      })
      // Backend unreachable: keep the built-in details rather than blanking.
      .catch(() => undefined);

    return () => { cancelled = true; };
  }, []);

  return footer;
}

/** Clears the cache. Exported for the admin editor to call after saving. */
export function clearFooterCache(): void {
  cache = null;
}
