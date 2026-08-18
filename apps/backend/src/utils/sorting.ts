import type { AuthRequest } from '../middleware/auth.js';

/**
 * Builds an ORDER BY clause from a request, against an allowlist.
 *
 * Column names cannot be parameterised — they are identifiers, not values — so
 * every field is checked against the caller's allowlist and anything unknown is
 * dropped rather than interpolated. This is the one place in the codebase where
 * request text reaches SQL structure, so it is deliberately the only place that
 * builds one.
 *
 * Accepts either shape:
 *   ?sortBy=created_at&sortDir=asc          the single-column form already in use
 *   ?sort=status:asc,created_at:desc        several columns, in priority order
 *
 * The pair form wins when both are sent.
 */

export interface SortTerm {
  field: string;
  dir: 'ASC' | 'DESC';
}

/** Parsed terms, for handing back to the client so it can show its arrows. */
export function parseSort(
  req: AuthRequest,
  allowed: readonly string[],
  fallback: string,
  /** Table alias to qualify each column with, for queries that join. */
  alias?: string
): { clause: string; terms: SortTerm[] } {
  const terms: SortTerm[] = [];

  const raw = typeof req.query.sort === 'string' ? req.query.sort : '';
  if (raw) {
    // A handful of columns is the useful range; beyond that the later terms
    // never break a tie anyway, and an unbounded list is just work to parse.
    for (const part of raw.split(',').slice(0, 4)) {
      const [field, dir] = part.split(':');
      const name = (field ?? '').trim();
      if (!allowed.includes(name)) continue;
      // Ignore a repeat of the same column; the first mention is its priority.
      if (terms.some((t) => t.field === name)) continue;
      terms.push({ field: name, dir: (dir ?? '').trim().toLowerCase() === 'asc' ? 'ASC' : 'DESC' });
    }
  }

  if (terms.length === 0) {
    const single = typeof req.query.sortBy === 'string' ? req.query.sortBy : '';
    const field = allowed.includes(single) ? single : fallback;
    terms.push({ field, dir: req.query.sortDir === 'asc' ? 'ASC' : 'DESC' });
  }

  // The alias is the caller's own string, never anything from the request.
  const qualify = (field: string) => (alias ? `${alias}.${field}` : field);

  // A stable tiebreaker. Without one, two rows equal on every sorted column can
  // swap places between requests and appear to duplicate or vanish as the
  // reader pages through.
  const clause = terms.map((t) => `${qualify(t.field)} ${t.dir}`).join(', ')
    + (terms.some((t) => t.field === 'id') ? '' : `, ${qualify('id')} ASC`);

  return { clause, terms };
}
