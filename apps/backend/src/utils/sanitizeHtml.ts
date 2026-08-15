/**
 * Allowlist sanitiser for admin-authored rich text.
 *
 * The public pages render this content as HTML, so anything stored here is
 * executed in every visitor's browser. Admin-only authoring is not sufficient
 * protection: a compromised or careless admin account would otherwise become
 * stored cross-site scripting on the public site. Everything not on the list
 * below is removed rather than escaped, so pasted formatting from a word
 * processor degrades to plain structure instead of appearing as markup.
 */

/** Tags a page section is allowed to contain. */
/**
 * h1 is deliberately absent: every public page already renders its own <h1>,
 * and a second one in body copy is an accessibility defect. The editor offers
 * H2 and H3 for the same reason.
 */
const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's',
  'h2', 'h3', 'h4',
  'ul', 'ol', 'li',
  'blockquote', 'a', 'span', 'div',
  // Emitted by the rich text editor: inline code, code blocks, and the
  // horizontal rule its input rules produce from '---'.
  'code', 'pre', 'hr',
]);

/** Attributes allowed, per tag. */
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'title', 'target', 'rel']),
};

/** Only these URL schemes may appear in an href. */
const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|\/|#)/i;

/** Elements removed with their contents, not just unwrapped. */
const STRIP_WITH_CONTENT = /<(script|style|iframe|object|embed|template|noscript)\b[\s\S]*?<\/\1\s*>/gi;

function sanitizeAttributes(tag: string, attrs: string): string {
  const allowed = ALLOWED_ATTRS[tag];
  if (!allowed) return '';

  const kept: string[] = [];
  const pattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(attrs)) !== null) {
    const name = (match[1] ?? '').toLowerCase();
    let value = match[2] ?? '';
    if (value.startsWith('"') || value.startsWith("'")) value = value.slice(1, -1);

    if (!allowed.has(name)) continue;
    // javascript:, data: and vbscript: hrefs are the obvious escape hatch.
    if (name === 'href' && !SAFE_HREF.test(value.trim())) continue;
    if (name === 'target' && value !== '_blank') continue;

    kept.push(`${name}="${value.replace(/"/g, '&quot;')}"`);
  }

  // A link opening in a new tab without noopener hands the opener to the
  // destination, so it is added rather than trusted to the author.
  if (tag === 'a' && kept.some((a) => a.startsWith('target='))) {
    if (!kept.some((a) => a.startsWith('rel='))) kept.push('rel="noopener noreferrer"');
  }

  return kept.length > 0 ? ` ${kept.join(' ')}` : '';
}

export function sanitizeHtml(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  if (input.trim() === '') return '';

  let html = String(input);

  // Comments can hide conditional markup; drop them first.
  html = html.replace(/<!--[\s\S]*?-->/g, '');
  html = html.replace(STRIP_WITH_CONTENT, '');

  html = html.replace(
    /<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g,
    (_full, closing: string, rawTag: string, attrs: string) => {
      const tag = rawTag.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) return '';
      if (closing) return `</${tag}>`;
      if (tag === 'br') return '<br>';
      return `<${tag}${sanitizeAttributes(tag, attrs)}>`;
    }
  );

  // Any angle bracket that survived is literal text, not markup.
  html = html.replace(/<(?![/a-zA-Z])/g, '&lt;');

  return html.trim();
}

/** Plain text of the content, for previews and search. */
export function htmlToText(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|h2|h3|h4|li|blockquote)>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
