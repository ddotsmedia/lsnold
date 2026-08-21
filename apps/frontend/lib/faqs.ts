'use client';

import { useEffect, useState } from 'react';

/**
 * The contact page's FAQs, as managed in admin -> FAQs.
 *
 * Reads the public endpoint, not the admin one: the contact page renders for
 * signed-out visitors, so /admin/faqs would answer 401 and the questions would
 * never arrive. The public route also filters to published rows, which the
 * admin one deliberately does not.
 *
 * Takes the questions the page shipped with as a fallback, so an unreachable
 * backend leaves the FAQ block reading exactly as it did before rather than
 * collapsing to nothing.
 */

const API = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1';

export interface Faq {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  display_order: number;
}

/** Cached for the tab's lifetime. */
let cache: Faq[] | null = null;

export function useFaqs(fallback: readonly Faq[]): readonly Faq[] {
  const [faqs, setFaqs] = useState<readonly Faq[]>(cache ?? fallback);

  useEffect(() => {
    if (cache) return;
    let cancelled = false;

    fetch(`${API}/faqs`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((rows: Faq[]) => {
        // An empty table means every question was deleted on purpose, so it is
        // honoured rather than treated as a failure and replaced by the
        // fallback. A failed request keeps the fallback.
        if (cancelled || !Array.isArray(rows)) return;
        cache = rows;
        setFaqs(rows);
      })
      .catch(() => undefined);

    return () => { cancelled = true; };
  }, []);

  return faqs;
}

/** Clears the cache. Exported for the admin editor to call after saving. */
export function clearFaqCache(): void {
  cache = null;
}
