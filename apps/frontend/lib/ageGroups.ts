'use client';

import { useEffect, useState } from 'react';

/**
 * The age group rows an admin edits, from GET /age-groups.
 *
 * These are merged **over** the page's built-in programme copy rather than
 * replacing it. The table holds a name, a description, an age range and one
 * image; the page also shows a daily routine, focus areas and several
 * paragraphs of detail, and there is no column for any of those. Swapping the
 * built-in array out for the endpoint would have deleted that writing from the
 * site — so what the database has wins, and what only the page has survives.
 */

const API = process.env.NEXT_PUBLIC_API_URL ?? '';

export interface AgeGroupRecord {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  min_age_months: number;
  max_age_months: number;
  image_url: string | null;
  sort_order: number;
}

/** "0–12 months" reads oddly for a nursery; families think in years after one. */
export function formatRange(minMonths: number, maxMonths: number): string {
  const asYears = (m: number) => (m % 12 === 0 ? m / 12 : m / 12);
  if (maxMonths <= 12) return `${minMonths}-${maxMonths} months`;
  const from = asYears(minMonths);
  const to = asYears(maxMonths);
  const plural = to === 1 ? 'year' : 'years';
  return `${from}-${to} ${plural}`;
}

/**
 * Fails quiet: a request problem leaves the page showing its built-in copy
 * rather than an error, which is the same contract as the media hooks.
 */
export function useAgeGroups(): Record<string, AgeGroupRecord> {
  const [groups, setGroups] = useState<Record<string, AgeGroupRecord>>({});

  useEffect(() => {
    let cancelled = false;

    fetch(`${API}/age-groups`)
      .then((r) => (r.ok ? r.json() : null))
      .then((rows: AgeGroupRecord[] | null) => {
        if (cancelled || !Array.isArray(rows)) return;
        const next: Record<string, AgeGroupRecord> = {};
        for (const row of rows) if (row.slug) next[row.slug] = row;
        setGroups(next);
      })
      .catch(() => undefined);

    return () => { cancelled = true; };
  }, []);

  return groups;
}
