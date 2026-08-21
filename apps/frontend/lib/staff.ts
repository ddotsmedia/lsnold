'use client';

import { useEffect, useState } from 'react';

/**
 * The team shown on the About / Nursery page, as managed in admin -> Staff.
 *
 * Same reasoning as lib/faqs.ts: public endpoint because the page renders for
 * signed-out visitors, and the hardcoded team is passed in as a fallback so a
 * failed request leaves the section as it was.
 */

const API = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1';

export interface StaffMember {
  id: string;
  name: string;
  role: string | null;
  bio: string | null;
  photo_url: string | null;
  display_order: number;
}

/** Cached for the tab's lifetime. */
let cache: StaffMember[] | null = null;

export function useStaff(fallback: readonly StaffMember[]): readonly StaffMember[] {
  const [staff, setStaff] = useState<readonly StaffMember[]>(cache ?? fallback);

  useEffect(() => {
    if (cache) return;
    let cancelled = false;

    fetch(`${API}/staff`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('failed'))))
      .then((rows: StaffMember[]) => {
        if (cancelled || !Array.isArray(rows)) return;
        cache = rows;
        setStaff(rows);
      })
      .catch(() => undefined);

    return () => { cancelled = true; };
  }, []);

  return staff;
}

/** Clears the cache. Exported for the admin editor to call after saving. */
export function clearStaffCache(): void {
  cache = null;
}
