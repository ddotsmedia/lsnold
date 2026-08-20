/**
 * The site's font choice, as a token rather than a CSS font stack.
 *
 * The stored value reaches a style attribute on every page. Keeping it a token
 * from this fixed list, and mapping to the stack here, means the form can only
 * ever produce one of eight known values — nothing a form field contains ends
 * up as CSS. The same list backs the CHECK constraint in migration 044 and the
 * zod enum in the route.
 *
 * Deliberately not a client module: the root layout is a server component and
 * imports FONT_STACKS to render the style attribute, so this file must be safe
 * to load on the server as well.
 */

export const FONT_TOKENS = [
  'default',
  'system',
  'georgia',
  'times',
  'arial',
  'verdana',
  'trebuchet',
  'comic',
] as const;

export type FontToken = (typeof FONT_TOKENS)[number];

/**
 * 'default' resolves to the site's own body font, Nunito, which next/font
 * already loads and exposes as --font-body. Every other option is a font the
 * reader's machine already has, so none of them costs a download.
 */
export const FONT_STACKS: Record<FontToken, string> = {
  default: 'var(--font-body), system-ui, -apple-system, "Segoe UI", sans-serif',
  system: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  georgia: 'Georgia, "Times New Roman", serif',
  times: '"Times New Roman", Times, serif',
  arial: 'Arial, Helvetica, sans-serif',
  verdana: 'Verdana, Geneva, sans-serif',
  trebuchet: '"Trebuchet MS", "Lucida Grande", sans-serif',
  comic: '"Comic Sans MS", "Comic Sans", cursive',
};

export const FONT_OPTIONS: ReadonlyArray<{ value: FontToken; label: string }> = [
  { value: 'default', label: 'Nunito — the site’s own font' },
  { value: 'system', label: 'System default' },
  { value: 'georgia', label: 'Georgia (serif)' },
  { value: 'times', label: 'Times New Roman (serif)' },
  { value: 'arial', label: 'Arial' },
  { value: 'verdana', label: 'Verdana' },
  { value: 'trebuchet', label: 'Trebuchet MS' },
  { value: 'comic', label: 'Comic Sans' },
];

export const MIN_FONT_SIZE = 12;
export const MAX_FONT_SIZE = 24;
export const DEFAULT_FONT_SIZE = 16;

export function isFontToken(value: unknown): value is FontToken {
  return typeof value === 'string' && (FONT_TOKENS as readonly string[]).includes(value);
}

/** Falls back rather than throwing: a bad value must not blank the page's font. */
export function fontStack(token: unknown): string {
  return isFontToken(token) ? FONT_STACKS[token] : FONT_STACKS.default;
}

export function clampFontSize(size: unknown): number {
  const n = Number(size);
  if (!Number.isFinite(n)) return DEFAULT_FONT_SIZE;
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(n)));
}
