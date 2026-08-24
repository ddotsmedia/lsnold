'use client';

import { useEffect, useState } from 'react';

/**
 * The YouTube video assigned to a page in admin -> Gallery -> Videos.
 *
 * Reads the public /youtube-videos endpoint — the same one the gallery uses —
 * and picks the first row for this page rather than adding a second endpoint
 * for one row. The list is small (a handful of videos), already cached per
 * tab, and one request serves every page that asks.
 *
 * Returns null when nothing is assigned, which is the normal state for most
 * pages: the caller renders no video section at all.
 */

const API = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1';

export interface PageVideo {
  id: string;
  title: string;
  description: string | null;
  youtube_id: string;
  thumbnail_url: string | null;
  display_order: number;
  page_slug: string | null;
}

/** Cached for the tab's lifetime; several pages may ask during one visit. */
let cache: PageVideo[] | null = null;
let inflight: Promise<PageVideo[]> | null = null;

function load(): Promise<PageVideo[]> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;

  inflight = fetch(`${API}/youtube-videos`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
    .then((rows: PageVideo[]) => {
      const list = Array.isArray(rows) ? rows : [];
      cache = list;
      return list;
    })
    // A missing video must never blank the section around it.
    .catch(() => [])
    .finally(() => { inflight = null; });

  return inflight;
}

export function usePageVideo(pageSlug: string): PageVideo | null {
  const [video, setVideo] = useState<PageVideo | null>(null);

  useEffect(() => {
    let cancelled = false;
    void load().then((rows) => {
      if (cancelled) return;
      const match = rows
        .filter((v) => v.page_slug === pageSlug)
        .sort((a, b) => a.display_order - b.display_order)[0];
      setVideo(match ?? null);
    });
    return () => { cancelled = true; };
  }, [pageSlug]);

  return video;
}

/** Clears the cache. For the admin manager to call after saving. */
export function clearPageVideoCache(): void {
  cache = null;
}
