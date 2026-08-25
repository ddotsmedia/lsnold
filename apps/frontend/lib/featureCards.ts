'use client';

import { useEffect, useState } from 'react';
import type { SafetyCardColor } from '@/components/SafetyCard';

/**
 * Feature cards written in admin → Feature Cards. See migration 062.
 *
 * A page asks for its own slug and picks out the group it wants by section key,
 * so one fetch covers every card row on the page.
 *
 * Fails quiet, like the media hooks: a request problem leaves the page showing
 * its built-in copy rather than an empty section.
 */

const API = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1';

const COLORS: readonly SafetyCardColor[] = ['blue', 'green', 'red', 'yellow', 'purple'];

export interface FeatureCard {
  id: string;
  page_slug: string;
  section_key: string;
  title: string;
  description: string | null;
  icon: string | null;
  color: string;
  sort_order: number;
}

/** The column is a plain varchar, so an unexpected value tints rather than throws. */
export function cardColor(value: string): SafetyCardColor {
  return COLORS.includes(value as SafetyCardColor) ? (value as SafetyCardColor) : 'blue';
}

export function useFeatureCards(pageSlug: string): FeatureCard[] {
  const [cards, setCards] = useState<FeatureCard[]>([]);

  useEffect(() => {
    let cancelled = false;

    fetch(`${API}/page-feature-cards/${pageSlug}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((rows: FeatureCard[] | null) => {
        if (!cancelled && Array.isArray(rows)) setCards(rows);
      })
      .catch(() => undefined);

    return () => { cancelled = true; };
  }, [pageSlug]);

  return cards;
}

/** The cards for one group, in order. */
export function cardsFor(cards: FeatureCard[], sectionKey: string): FeatureCard[] {
  return cards
    .filter((c) => c.section_key === sectionKey)
    .sort((a, b) => a.sort_order - b.sort_order);
}
