'use client';
import { cloudinaryResize } from '../lib/cloudinary';

export interface PartnerLogoProps {
  name: string;
  logoUrl?: string | null;
  websiteUrl?: string | null;
}

const TILE =
  'flex h-20 w-full items-center justify-center rounded-xl bg-white p-3 shadow-sm ' +
  'ring-1 ring-gray-200 transition-all duration-200';

/**
 * One partner in the homepage strip. Renders as a link only when a website was
 * supplied, so a partner without one is not an empty anchor that keyboard users
 * can tab into and activate to no effect.
 */
export function PartnerLogo({ name, logoUrl, websiteUrl }: PartnerLogoProps) {
  const inner = logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    /* The tile is 80px tall with padding, so a logo renders at most ~56px
       high and a couple of hundred wide. One bounded URL covers that at 2x;
       a srcSet ladder across a tile this size has nothing to choose between.
       Width only, so object-contain keeps a tall logo's shape. */
    <img
      src={cloudinaryResize(logoUrl, 400)}
      alt={name}
      loading="lazy"
      className="max-h-full max-w-full object-contain"
    />
  ) : (
    // No logo uploaded: show the name rather than an anonymous grey box.
    <span className="px-1 text-center text-xs font-semibold leading-tight text-gray-500">
      {name}
    </span>
  );

  if (!websiteUrl) {
    return (
      <div className={TILE} title={name}>
        {inner}
      </div>
    );
  }

  return (
    <a
      href={websiteUrl}
      target="_blank"
      rel="noopener noreferrer"
      title={`${name} — opens in a new tab`}
      className={`${TILE} hover:-translate-y-0.5 hover:shadow-md hover:ring-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-800`}
    >
      {inner}
      <span className="sr-only">{name} website, opens in a new tab</span>
    </a>
  );
}

export default PartnerLogo;
