'use client';

import { useState } from 'react';
import { usePageVideo } from '../lib/pageVideo';
import { cloudinaryResize } from '../lib/cloudinary';

/**
 * The video assigned to a page, if there is one.
 *
 * Renders the thumbnail with a play button and only swaps in the YouTube
 * iframe once someone clicks. An embedded player loads several hundred
 * kilobytes and sets cookies before anyone has asked to watch anything —
 * a facade costs one image until it is wanted.
 *
 * Renders nothing at all when no video is assigned, so a page can call this
 * unconditionally.
 */

export interface PageVideoProps {
  pageSlug: string;
  /** Heading above the player. Omit for no heading. */
  heading?: string;
  className?: string;
}

export function PageVideo({ pageSlug, heading, className }: PageVideoProps) {
  const video = usePageVideo(pageSlug);
  const [playing, setPlaying] = useState(false);

  if (!video) return null;

  const thumb =
    video.thumbnail_url ?? `https://i.ytimg.com/vi/${video.youtube_id}/hqdefault.jpg`;

  return (
    <section className={className ?? 'bg-white py-16 md:py-24'} aria-labelledby={`video-${pageSlug}`}>
      <div className="mx-auto max-w-4xl px-4 md:px-6">
        <h2
          id={`video-${pageSlug}`}
          className={
            heading
              ? 'mb-6 text-center text-2xl font-bold text-gray-800 md:text-3xl'
              : 'sr-only'
          }
        >
          {heading ?? video.title}
        </h2>

        <div className="relative aspect-video overflow-hidden rounded-lg shadow-md">
          {playing ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${video.youtube_id}?autoplay=1`}
              title={video.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 h-full w-full border-0"
            />
          ) : (
            <button
              type="button"
              onClick={() => setPlaying(true)}
              className="group absolute inset-0 h-full w-full cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-600"
              aria-label={`Play video: ${video.title}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {/* An uploaded thumbnail is a Cloudinary asset and gets bounded;
                  the YouTube fallback is already a fixed 480px still, and
                  passes through untouched. */}
              <img
                src={cloudinaryResize(thumb, 800)}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
              <span className="absolute inset-0 bg-black/25 transition-colors group-hover:bg-black/15" />
              <span className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-red-600 shadow-lg transition-transform group-hover:scale-110">
                <svg viewBox="0 0 24 24" className="ml-1 h-7 w-7 fill-white" aria-hidden="true">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
            </button>
          )}
        </div>

        {video.description && (
          <p className="mt-4 text-center text-base text-gray-600">{video.description}</p>
        )}
      </div>
    </section>
  );
}

export default PageVideo;
