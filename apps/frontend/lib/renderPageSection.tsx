'use client';

import type { ReactNode } from 'react';
import type { PageSection } from '@/components/PageSections';

/**
 * Swaps a page's built-in copy for the text an admin has written.
 *
 * A `.tsx` file, not `.ts`: it returns JSX.
 *
 * Liveness is not checked here. GET /pages/:slug/content already returns only
 * sections that are visible, non-empty, and whose publish moment has passed —
 * so a section arriving in that response is by definition live, and testing a
 * `published_at` the endpoint never sends would mean the fallback always won
 * and the feature never switched on.
 */

/** Keyed lookup over the flat list the hook returns. */
export function sectionMap(sections: PageSection[]): Record<string, PageSection> {
  const map: Record<string, PageSection> = {};
  for (const section of sections) map[section.section_key] = section;
  return map;
}

export function renderPageSection(
  section: PageSection | undefined,
  fallback: ReactNode
): ReactNode {
  const html = section?.content;
  if (!html || html.replace(/<[^>]*>/g, '').trim() === '') return fallback;

  const heading = section?.title?.trim();

  return (
    <>
      {/* An optional heading above the text. Blank on every section until an
          admin types one, so the page keeps the heading its own layout already
          provides rather than growing a second one. */}
      {heading && (
        <h3 className="mb-3 text-xl font-bold text-gray-800 md:text-2xl">{heading}</h3>
      )}
      <div
        // The public content styles, not the admin's dark ones: this renders on
        // the public site. There is no @tailwindcss/typography in this project,
        // so `prose` classes would style nothing.
        className="page-content"
        // Sanitised server-side against an allowlist before it was stored.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  );
}

/**
 * The same swap as a component, for the common case of a named slot with the
 * original JSX as its fallback.
 */
export function EditableProse({
  sections,
  sectionKey,
  children,
}: {
  sections: Record<string, PageSection>;
  sectionKey: string;
  /** What the page showed before anyone wrote anything. */
  children: ReactNode;
}) {
  return <>{renderPageSection(sections[sectionKey], children)}</>;
}
