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

  // The heading is deliberately not rendered here. These sections sit inside
  // blocks that already carry their own heading, so drawing the title here
  // stacked a second one underneath it. EditableHeading below puts the typed
  // heading where the built-in one was, replacing it rather than joining it.
  return (
    <div
      // The public content styles, not the admin's dark ones: this renders on
      // the public site. There is no @tailwindcss/typography in this project,
      // so `prose` classes would style nothing.
      className="page-content"
      // Sanitised server-side against an allowlist before it was stored.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/**
 * The block's heading, overridden by whatever an admin typed.
 *
 * Takes the page's own heading as its children and swaps in the section's
 * title when one is set — so the page shows exactly one heading either way,
 * and editing it in the panel replaces the built-in wording rather than
 * appearing beneath it.
 *
 * The fallback stays because most sections have no heading and are unpublished.
 * Deleting the built-in headings outright would leave those pages with no
 * heading at all, and no <h1> in the server-rendered HTML for a crawler that
 * does not run JavaScript.
 */
export function EditableHeading({
  sections,
  sectionKey,
  className,
  id,
  children,
}: {
  sections: Record<string, PageSection>;
  sectionKey: string;
  /** Classes matching the heading this replaces, so the page keeps its look. */
  className?: string;
  /** Carried over from the heading being replaced: sections point at it with
      aria-labelledby, and dropping it would leave that pointing at nothing. */
  id?: string;
  /** The heading the page shipped with. */
  children: ReactNode;
}) {
  const title = sections[sectionKey]?.title?.trim();
  if (!title) return <>{children}</>;
  return <h2 id={id} className={className}>{title}</h2>;
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
