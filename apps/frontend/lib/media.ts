'use client';

import { useEffect, useState } from 'react';

/**
 * Reads images uploaded through the admin Media Library.
 *
 * Every hook fails quiet: if the request errors or nothing has been uploaded
 * yet, the caller gets null and keeps whatever it rendered before. A missing
 * logo must never take out the header.
 */

const API = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1';

export interface SiteImage {
  id: string;
  url: string;
  alt_text: string | null;
  title: string;
  width: number | null;
  height: number | null;
}

/** Site-wide slots: logo, header_bg, footer_logo, favicon. */
export function useSiteMedia(): Record<string, SiteImage> {
  const [media, setMedia] = useState<Record<string, SiteImage>>({});

  useEffect(() => {
    let cancelled = false;
    fetch(`${API}/site-media`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((data: Record<string, SiteImage>) => {
        if (!cancelled && data && typeof data === 'object') setMedia(data);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  return media;
}

/** Per-page sections: hero, feature1..3, background. */
export function usePageMedia(slug: string): Record<string, SiteImage> {
  const [sections, setSections] = useState<Record<string, SiteImage>>({});

  useEffect(() => {
    let cancelled = false;
    fetch(`${API}/page-media/${slug}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((data: { sections?: Record<string, SiteImage> }) => {
        if (!cancelled && data?.sections) setSections(data.sections);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [slug]);

  return sections;
}

export interface AgeGroupImages {
  hero: SiteImage | null;
  icon: SiteImage | null;
  banner: SiteImage | null;
  gallery: SiteImage[];
}

const EMPTY_AGE_GROUP: AgeGroupImages = { hero: null, icon: null, banner: null, gallery: [] };

/** Images for one age group. Pass null to skip fetching. */
export function useAgeGroupMedia(slug: string | null): AgeGroupImages {
  const [images, setImages] = useState<AgeGroupImages>(EMPTY_AGE_GROUP);

  useEffect(() => {
    if (!slug) { setImages(EMPTY_AGE_GROUP); return; }
    let cancelled = false;
    fetch(`${API}/age-group-media/${slug}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((data: { images?: AgeGroupImages }) => {
        if (!cancelled && data?.images) setImages({ ...EMPTY_AGE_GROUP, ...data.images });
      })
      .catch(() => { if (!cancelled) setImages(EMPTY_AGE_GROUP); });
    return () => { cancelled = true; };
  }, [slug]);

  return images;
}

/**
 * Every uploaded image for several age groups at once, keyed by slug. Fetched
 * in parallel on mount so the cards do not each open their own request.
 *
 * This kept only `icon` until now and dropped the rest of each response.
 * Uploads made in the panel are stored as `hero`, so the photographs were
 * being fetched and then discarded on the next line, and the cards fell back
 * to their emoji — which looked exactly like nothing had been uploaded.
 */
export function useAgeGroupImages(slugs: readonly string[]): Record<string, AgeGroupImages> {
  const [images, setImages] = useState<Record<string, AgeGroupImages>>({});
  // Slugs are a fixed list defined at module scope; joining them keeps the
  // effect from re-running on every render because the array is a new object.
  const key = slugs.join(',');

  useEffect(() => {
    let cancelled = false;
    const list = key ? key.split(',') : [];

    Promise.all(
      list.map((slug) =>
        fetch(`${API}/age-group-media/${slug}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((data: { images?: AgeGroupImages } | null) => ({ slug, images: data?.images ?? null }))
          .catch(() => ({ slug, images: null }))
      )
    ).then((results) => {
      if (cancelled) return;
      const next: Record<string, AgeGroupImages> = {};
      for (const { slug, images: found } of results) {
        if (found) next[slug] = { ...EMPTY_AGE_GROUP, ...found };
      }
      setImages(next);
    });

    return () => { cancelled = true; };
  }, [key]);

  return images;
}

/**
 * "Bouncing Bunnies" -> "bouncing-bunnies". The admin panel stores images
 * against these slugs, so both sides must derive them the same way.
 */
export function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
