'use client';

import { useEffect, useState } from 'react';

/**
 * Text sections written in admin → Pages → Edit content.
 *
 * The endpoint only returns sections that are visible and actually have text,
 * so a page renders nothing extra until someone writes something. That is what
 * makes this safe to drop into pages whose copy is still in the components:
 * the built-in wording stays until it is deliberately added to here.
 */

const API = process.env.NEXT_PUBLIC_API_URL;

export interface PageSection {
  id: string;
  section_key: string;
  title: string | null;
  content: string | null;
  sort_order: number;
}

export function usePageSections(pageSlug: string): PageSection[] {
  const [sections, setSections] = useState<PageSection[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API}/pages/${pageSlug}/content`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((rows: PageSection[]) => {
        if (!cancelled && Array.isArray(rows)) setSections(rows);
      })
      // A content failure must never break the page it decorates.
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [pageSlug]);

  return sections;
}

/**
 * Renders the page's sections, or nothing at all when there are none.
 *
 * The HTML is sanitised against an allowlist on the server before it is stored,
 * which is why it can be set as markup here.
 */
/**
 * Keys every page renders inline, in place of their own copy. Excluded here so
 * the same text cannot appear twice — once where it belongs and again in this
 * block at the foot of the page.
 *
 * What is left is any section an admin adds themselves, which has nowhere else
 * to go and so lands here.
 */
const RENDERED_INLINE = ['intro', 'body'];

export function PageSections({
  pageSlug,
  className = 'bg-white py-16 md:py-24',
  /** Render only these keys, so a page can place sections individually. */
  only,
  /**
   * The keys this page already renders itself, beyond the two above. A page
   * passes every sectionKey it hands to EditableHeading or EditableProse; a key
   * missing from the list is published twice, once in place and once here.
   *
   * The page owns this rather than the component deriving it, because only the
   * page knows which keys it reads — sectionMap holds every section the
   * endpoint returned, consumed or not, so keying off that would empty this
   * block entirely and admin-added sections would have nowhere to appear.
   */
  consumedKeys = [],
}: {
  pageSlug: string;
  className?: string;
  only?: readonly string[];
  consumedKeys?: readonly string[];
}) {
  const all = usePageSections(pageSlug);
  const sections = only
    ? all.filter((s) => only.includes(s.section_key))
    : all.filter(
        (s) => !RENDERED_INLINE.includes(s.section_key) && !consumedKeys.includes(s.section_key)
      );

  if (sections.length === 0) return null;

  return (
    <section className={className} aria-label="Page information">
      <div className="mx-auto max-w-4xl space-y-10 px-4 md:px-6">
        {sections.map((section) => (
          <article key={section.id}>
            {section.title && (
              <h2 className="mb-4 text-2xl font-bold text-gray-800 md:text-3xl">{section.title}</h2>
            )}
            <div
              className="page-content text-base leading-relaxed text-gray-700"
              dangerouslySetInnerHTML={{ __html: section.content ?? '' }}
            />
          </article>
        ))}
      </div>
    </section>
  );
}

export default PageSections;
