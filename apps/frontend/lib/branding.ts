'use client';

import { useEffect, useState } from 'react';

/**
 * The site's name, tagline and accent colour, as set in admin -> Branding.
 *
 * Reads the public endpoint, not the admin one. The header renders on every
 * visitor-facing page and a visitor holds no token, so /admin/branding would
 * answer 401 and the name would never arrive — it has to be the unauthenticated
 * read.
 *
 * The logo is not part of this. It comes from useSiteMedia / getSiteMedia,
 * where it already lived before this page existed.
 */

const API = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1';

export interface SiteBranding {
  site_name: string;
  tagline: string | null;
  primary_color: string;
}

/**
 * What the site says today.
 *
 * Used as the initial state rather than something empty, so the first paint is
 * already correct and the fetch only ever changes anything if somebody has
 * actually renamed the site. An empty default would blank the header for a
 * moment on every page load — the same flicker the logo had.
 */
export const DEFAULT_BRANDING: SiteBranding = {
  site_name: 'Little Smarties',
  tagline: null,
  primary_color: '#1e40af',
};

export function useBranding(): SiteBranding {
  const [branding, setBranding] = useState<SiteBranding>(DEFAULT_BRANDING);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API}/branding`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((data: Partial<SiteBranding>) => {
        if (cancelled || !data || typeof data !== 'object') return;
        // Field by field, so a row missing a column cannot blank the header.
        setBranding({
          site_name: data.site_name || DEFAULT_BRANDING.site_name,
          tagline: data.tagline ?? null,
          primary_color: data.primary_color || DEFAULT_BRANDING.primary_color,
        });
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  return branding;
}
