'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { SiteImage } from '@/lib/media';

/**
 * Carries the site-wide images fetched on the server down to the client
 * components that need them.
 *
 * The header is a client component — it has a mobile menu, a scroll listener
 * and a pathname — so it cannot fetch on the server itself. The layout can,
 * and this is how the result reaches it: already in the tree on first paint,
 * rather than arriving later on an effect.
 *
 * The default is an empty object rather than null so a component rendered
 * outside the provider still works. useSiteMedia treats empty as "nothing from
 * the server" and falls back to fetching, which is exactly the old behaviour.
 */

const SiteMediaContext = createContext<Record<string, SiteImage>>({});

export function SiteMediaProvider({
  value,
  children,
}: {
  value: Record<string, SiteImage>;
  children: ReactNode;
}) {
  return <SiteMediaContext.Provider value={value}>{children}</SiteMediaContext.Provider>;
}

export function useServerSiteMedia(): Record<string, SiteImage> {
  return useContext(SiteMediaContext);
}
