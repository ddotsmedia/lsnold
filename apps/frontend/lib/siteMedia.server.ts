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

const INTERNAL_API =
  process.env.INTERNAL_API_URL ?? 'http://backend:3011/api/v1';

export async function getSiteMedia(): Promise<Record<string, SiteImage>> {
  try {
    const response = await fetch(`${INTERNAL_API}/site-media`, {
      // An hour. The logo changes when somebody uploads a new one, which is
      // rare; paying for a request on every page render to catch it sooner is
      // not a good trade.
      next: { revalidate: 3600 },
    });
    if (!response.ok) return {};
    const data: unknown = await response.json();
    if (!data || typeof data !== 'object') return {};
    return data as Record<string, SiteImage>;
  } catch {
    // Fails quiet, like every other reader in lib/media.ts. If the backend is
    // down — or unreachable at build time, when this runs during prerender —
    // the client hook still fetches and fills the logo in. That restores the
    // old flicker for that one render, which is the correct thing to degrade
    // to: a late logo beats a build that fails over a picture.
    return {};
  }
}
