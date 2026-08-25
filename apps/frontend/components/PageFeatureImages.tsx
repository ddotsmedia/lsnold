'use client';

import type { SiteImage } from '@/lib/media';

/**
 * Adds a resize to a Cloudinary URL, so a phone is not sent a desktop image.
 *
 * The transformation is inserted as its own component directly after
 * /image/upload/, which chains ahead of whatever is already there:
 *
 *   .../upload/f_auto,q_auto/v1/bayrotna/pages/abc
 *   .../upload/w_400,h_300,c_fill/f_auto,q_auto/v1/bayrotna/pages/abc
 *
 * Not appended to the end of the path. That lands inside the public ID rather
 * than the transformation segment and Cloudinary answers 404 — verified
 * against the live account before this was written.
 *
 * Anything that is not a Cloudinary delivery URL is returned untouched, so a
 * bundled file or an external image still renders.
 */
const UPLOAD_MARKER = '/image/upload/';

export function cloudinaryResize(url: string, width: number, height: number): string {
  const at = url.indexOf(UPLOAD_MARKER);
  if (at === -1 || !url.includes('res.cloudinary.com')) return url;
  const cut = at + UPLOAD_MARKER.length;
  return `${url.slice(0, cut)}w_${width},h_${height},c_fill/${url.slice(cut)}`;
}

/** 4:3, the ratio the strip crops to. */
const WIDTHS = [400, 600, 1000] as const;

/**
 * A srcSet holding only the widths the source can actually fill.
 *
 * Upscaling costs rather than saves: the feature image on /nursery is 450px
 * wide, and asking Cloudinary for 1000px returns 83KB where the original is
 * 57KB. Candidates wider than the source are dropped, and the smallest is
 * always kept so a narrow image still has an entry.
 */
export function buildSrcSet(image: SiteImage): string {
  const natural = image.width ?? Infinity;
  const usable = WIDTHS.filter((w) => w <= natural);
  const widths = usable.length > 0 ? usable : [WIDTHS[0]];
  return widths
    .map((w) => `${cloudinaryResize(image.url, w, Math.round((w * 3) / 4))} ${w}w`)
    .join(', ');
}

/**
 * The feature_1..3 images uploaded for a page, as a photo strip.
 *
 * Renders nothing while every slot is empty, so a page with no photographs
 * reads exactly as it did before. Two images lay out as a pair rather than
 * leaving a gap where the third would be.
 */
export function PageFeatureImages({
  images,
  heading,
  slots = ['feature_1', 'feature_2', 'feature_3'],
  className = 'bg-white py-16 md:py-24',
}: {
  images: Record<string, SiteImage | undefined>;
  heading?: string;
  /** Which slots to draw, so a page can spend one elsewhere. */
  slots?: readonly string[];
  /** Section wrapper classes, so a page can match its own rhythm. */
  className?: string;
}) {
  const features = slots
    .map((slot) => images[slot])
    .filter((image): image is SiteImage => Boolean(image));

  if (features.length === 0) return null;

  const columns =
    features.length === 1
      ? 'grid-cols-1'
      : features.length === 2
        ? 'grid-cols-1 sm:grid-cols-2'
        : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';

  return (
    <section className={className} aria-label={heading ?? 'Photographs'}>
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        {heading && (
          <h2 className="mb-8 text-center text-2xl font-bold text-gray-800 md:text-3xl">
            {heading}
          </h2>
        )}
        <div className={`grid gap-6 ${columns}`}>
          {features.map((image) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={image.id}
              src={cloudinaryResize(image.url, 600, 450)}
              srcSet={buildSrcSet(image)}
              // One column below sm, two to lg, three above — matching the
              // grid classes chosen above, minus the padding and the gaps.
              sizes={
                features.length === 1
                  ? '(max-width: 640px) calc(100vw - 32px), 1152px'
                  : features.length === 2
                    ? '(max-width: 640px) calc(100vw - 32px), calc(50vw - 28px)'
                    : '(max-width: 640px) calc(100vw - 32px), (max-width: 1024px) calc(50vw - 28px), calc(33vw - 24px)'
              }
              alt={image.alt_text || ''}
              loading="lazy"
              className="aspect-4/3 w-full rounded-lg object-cover shadow-md"
            />
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Wraps children in a page's uploaded background image. Without one the
 * children render inside the fallback classes instead, so the section keeps
 * whatever look it already had.
 */
export function PageBackground({
  image,
  children,
  fallbackClassName = '',
  className = '',
}: {
  image: SiteImage | null | undefined;
  children: React.ReactNode;
  fallbackClassName?: string;
  className?: string;
}) {
  if (!image) {
    return <section className={`${className} ${fallbackClassName}`}>{children}</section>;
  }

  return (
    <section className={`relative overflow-hidden ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {/* Full-bleed, so it is always viewport-wide however the section is
          sized — hence 100vw rather than the strip's column arithmetic. */}
      <img
        src={cloudinaryResize(image.url, 600, 450)}
        srcSet={buildSrcSet(image)}
        sizes="100vw"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover"
      />
      {/* Dimmed: the text over it was written for a solid background. */}
      <div className="absolute inset-0 bg-white/85" aria-hidden="true" />
      <div className="relative z-10">{children}</div>
    </section>
  );
}

export default PageFeatureImages;
