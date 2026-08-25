/**
 * Cloudinary delivery helpers, so a phone is not sent a desktop image.
 *
 * Lives here rather than in PageFeatureImages because most of the site's
 * photographs are rendered by other components, and two copies of this would
 * drift — the second one usually being the wrong one.
 */

const UPLOAD_MARKER = '/image/upload/';

/** A Cloudinary delivery URL, the only kind these transforms apply to. */
function isCloudinary(url: string): boolean {
  return url.includes('res.cloudinary.com') && url.includes(UPLOAD_MARKER);
}

/**
 * Adds a resize to a Cloudinary URL.
 *
 * The transformation is inserted as its own component directly after
 * /image/upload/, which chains ahead of whatever is already there:
 *
 *   .../upload/f_auto,q_auto/v1/bayrotna/pages/abc
 *   .../upload/w_400,h_300,c_fill/f_auto,q_auto/v1/bayrotna/pages/abc
 *
 * Not appended to the end of the path. That lands inside the public ID rather
 * than the transformation segment, and Cloudinary answers 404 for every size —
 * checked against the live account both ways.
 *
 * With no height the width is a bound rather than a crop (c_limit), which is
 * what an image of unknown shape wants: it is never enlarged and never
 * re-cropped. Pass a height only where the layout already fixes the ratio.
 *
 * Anything that is not a Cloudinary delivery URL is returned untouched, so a
 * bundled file or an external image still renders.
 */
export function cloudinaryResize(url: string, width: number, height?: number): string {
  if (!url || !isCloudinary(url)) return url;
  const cut = url.indexOf(UPLOAD_MARKER) + UPLOAD_MARKER.length;
  const transform =
    height === undefined ? `w_${width},c_limit` : `w_${width},h_${height},c_fill`;
  return `${url.slice(0, cut)}${transform}/${url.slice(cut)}`;
}

/**
 * A srcSet across the given widths.
 *
 * Candidates wider than the source are dropped when the natural width is
 * known. Upscaling costs rather than saves — a 450px-wide upload asked for at
 * 1000px comes back 83KB where the original is 57KB. The smallest candidate is
 * always kept, so a narrow image still has an entry to offer.
 *
 * `ratio` is height ÷ width. Given one, each candidate is cropped to it;
 * without one the widths are bounds and the image keeps its own shape.
 */
export function buildSrcSet(
  url: string,
  widths: readonly number[],
  options: { naturalWidth?: number | null; ratio?: number } = {}
): string | undefined {
  // Nothing to offer for a URL this cannot resize: every candidate would be
  // the same file under a different width descriptor, which is markup that
  // looks like an optimisation and is not one. Returning undefined leaves the
  // attribute off entirely. Some gallery rows still point at picsum.photos.
  if (!url || widths.length === 0 || !isCloudinary(url)) return undefined;
  const natural = options.naturalWidth ?? Infinity;
  const usable = widths.filter((w) => w <= natural);
  const chosen = usable.length > 0 ? usable : [Math.min(...widths)];

  return chosen
    .map((w) => {
      const height = options.ratio ? Math.round(w * options.ratio) : undefined;
      return `${cloudinaryResize(url, w, height)} ${w}w`;
    })
    .join(', ');
}

/** Widths for a photograph in a 1/2/3-column card grid. */
export const CARD_WIDTHS = [300, 500, 700] as const;

/** Widths for something that spans the page. */
export const WIDE_WIDTHS = [400, 800, 1200] as const;

/** Widths for a full-bleed hero, which goes wider than the content shell. */
export const HERO_WIDTHS = [400, 800, 1200, 1600] as const;

/** `sizes` for a 1/2/3-column card grid inside the site's max-w-6xl shell. */
export const CARD_SIZES =
  '(max-width: 640px) calc(100vw - 32px), (max-width: 1024px) calc(50vw - 28px), calc(33vw - 24px)';
