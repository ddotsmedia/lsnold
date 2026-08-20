import type { SiteImage } from './media';

/**
 * Reads the site-wide slots on the server, so the header can be rendered with
 * the real logo already in it.
 *
 * Why this exists separately from useSiteMedia: that hook starts empty and
 * fills on an effect, which means the first paint always shows the drawn
 * LogoMark and then swaps to the uploaded image. The swap is the flicker.
 *
 * The URL here is deliberately not the relative /api/v1 the browser uses.
 * Relative paths have nothing to resolve against inside Node — there is no
 * document origin — so a server fetch needs a real host. The frontend
 * container reaches the backend directly over the compose network, which also
 * skips nginx and the public hostname on every render.
 */

/**
 * Two hosts, in order, because this code runs in two places that can reach
 * different things.
 *
 * At runtime the frontend container sits on the compose network and resolves
 * `backend` directly, which skips nginx and the public round trip.
 *
 * During `docker build` it does not: a build stage joins no compose network,
 * so `backend` is ENOTFOUND. That matters because the pages are prerendered at
 * build time — a failure there bakes an empty result into the static HTML and
 * the flicker survives the fix. The build stage does have outbound internet,
 * so the public host covers it.
 */
const SOURCES = [
  process.env.INTERNAL_API_URL ?? 'http://backend:3011/api/v1',
  process.env.NEXT_PUBLIC_SITE_URL
    ? `${process.env.NEXT_PUBLIC_SITE_URL}/api/v1`
    : 'https://bayrotna.ae/api/v1',
];

export async function getSiteMedia(): Promise<Record<string, SiteImage>> {
  for (const base of SOURCES) {
    try {
      const response = await fetch(`${base}/site-media`, {
        // An hour. The logo changes when somebody uploads a new one, which is
        // rare; paying for a request on every page render to catch it sooner
        // is not a good trade.
        next: { revalidate: 3600 },
      });
      if (!response.ok) continue;
      const data: unknown = await response.json();
      if (!data || typeof data !== 'object') continue;
      return data as Record<string, SiteImage>;
    } catch {
      // Try the next host.
    }
  }

  // Fails quiet, like every other reader in lib/media.ts. With nothing from
  // the server the client hook fetches as it always did, which restores the
  // old flicker for that render — the correct thing to degrade to. A late
  // logo beats a build that fails over a picture.
  return {};
}

/**
 * The site's name, colour, font and text size, read on the server.
 *
 * Separate from getSiteMedia because the root layout needs this before it can
 * render <html> — the font and size go on that element, and applying them from
 * a client effect would repaint the whole page a moment after it appeared.
 *
 * The layout is a server component, so it cannot call useBranding. That is why
 * this exists rather than the hook being reused there.
 */
export interface ServerBranding {
  site_name: string;
  tagline: string | null;
  primary_color: string;
  font_family: string;
  base_font_size: number;
}

const BRANDING_FALLBACK: ServerBranding = {
  site_name: 'Little Smarties',
  tagline: null,
  primary_color: '#1e40af',
  font_family: 'default',
  base_font_size: 16,
};

export async function getSiteBranding(): Promise<ServerBranding> {
  for (const base of SOURCES) {
    try {
      const response = await fetch(`${base}/branding`, { next: { revalidate: 3600 } });
      if (!response.ok) continue;
      const data: unknown = await response.json();
      if (!data || typeof data !== 'object') continue;
      const row = data as Partial<ServerBranding>;
      return {
        site_name: row.site_name || BRANDING_FALLBACK.site_name,
        tagline: row.tagline ?? null,
        primary_color: row.primary_color || BRANDING_FALLBACK.primary_color,
        font_family: row.font_family || BRANDING_FALLBACK.font_family,
        base_font_size: Number(row.base_font_size) || BRANDING_FALLBACK.base_font_size,
      };
    } catch {
      // Try the next host.
    }
  }
  return BRANDING_FALLBACK;
}
