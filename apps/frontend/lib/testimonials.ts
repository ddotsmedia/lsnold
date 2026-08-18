'use client';

import { useEffect, useState } from 'react';

/**
 * Published testimonials for a page.
 *
 * Takes a fallback so a page keeps its built-in reviews if the request fails or
 * nothing has been published for it. The pages had these reviews hardcoded
 * before this existed, and migration 025 seeded the database from them, so the
 * two agree.
 */

const API = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1';

export interface ApiTestimonial {
  id: string;
  author_name: string;
  author_title: string | null;
  author_image_url: string | null;
  quote: string;
  rating: number | null;
}

export function useTestimonials(
  pageSlug: string,
  fallback: readonly ApiTestimonial[] = []
): readonly ApiTestimonial[] {
  const [items, setItems] = useState<readonly ApiTestimonial[]>(fallback);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API}/testimonials?page_slug=${encodeURIComponent(pageSlug)}&limit=50`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((data: { items?: ApiTestimonial[] }) => {
        // An empty list means nothing is published yet, not that the built-in
        // reviews should disappear.
        if (!cancelled && Array.isArray(data?.items) && data.items.length > 0) {
          setItems(data.items);
        }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [pageSlug]);

  return items;
}
