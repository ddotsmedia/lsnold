'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Small rich text editor over a contentEditable region.
 *
 * Deliberately dependency-free. The alternatives are large, and this only needs
 * headings, bold, italic, lists and links. The server sanitises whatever comes
 * out of it against an allowlist, so the editor is a convenience rather than
 * the security boundary.
 */

interface ToolbarButton {
  label: string;
  title: string;
  command: string;
  value?: string;
  /** Rendered with this style so the button previews what it does. */
  className?: string;
}

const BUTTONS: readonly ToolbarButton[] = [
  { label: 'H2', title: 'Heading', command: 'formatBlock', value: 'h2', className: 'font-bold' },
  { label: 'H3', title: 'Subheading', command: 'formatBlock', value: 'h3', className: 'font-semibold' },
  { label: 'P', title: 'Paragraph', command: 'formatBlock', value: 'p' },
  { label: 'B', title: 'Bold', command: 'bold', className: 'font-bold' },
  { label: 'I', title: 'Italic', command: 'italic', className: 'italic' },
  { label: '• List', title: 'Bulleted list', command: 'insertUnorderedList' },
  { label: '1. List', title: 'Numbered list', command: 'insertOrderedList' },
];

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Write the text for this section…',
  minHeight = 180,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);

  // Only written when the incoming value differs from what is already in the
  // DOM. Assigning innerHTML on every render would move the caret to the start
  // on each keystroke.
  useEffect(() => {
    const el = ref.current;
    if (el && el.innerHTML !== value) el.innerHTML = value || '';
  }, [value]);

  const exec = (button: ToolbarButton) => {
    ref.current?.focus();
    // execCommand is deprecated but is still the only thing every browser
    // implements for this, and there is no replacement API.
    document.execCommand(button.command, false, button.value);
    onChange(ref.current?.innerHTML ?? '');
  };

  const addLink = () => {
    const url = window.prompt('Link address (https://…)');
    if (!url) return;
    if (!/^(https?:\/\/|mailto:|tel:|\/|#)/i.test(url.trim())) {
      window.alert('Links must start with https://, mailto:, tel:, / or #');
      return;
    }
    ref.current?.focus();
    document.execCommand('createLink', false, url.trim());
    onChange(ref.current?.innerHTML ?? '');
  };

  const isEmpty = !value || value.replace(/<[^>]*>/g, '').trim() === '';

  return (
    <div className={`rounded-lg border transition-colors ${focused ? 'border-emerald-500/50' : 'border-zinc-800'}`}>
      <div className="flex flex-wrap gap-1 border-b border-zinc-800 p-2">
        {BUTTONS.map((button) => (
          <button
            key={button.label}
            type="button"
            title={button.title}
            // onMouseDown, not onClick: clicking would blur the editor first
            // and the browser would lose the selection the command acts on.
            onMouseDown={(e) => { e.preventDefault(); exec(button); }}
            className={`inline-flex min-h-12 min-w-12 items-center justify-center rounded px-2 py-1 text-xs text-zinc-300 transition-colors hover:bg-zinc-800 ${button.className ?? ''}`}
          >
            {button.label}
          </button>
        ))}
        <button
          type="button"
          title="Add a link"
          onMouseDown={(e) => { e.preventDefault(); addLink(); }}
          className="inline-flex min-h-12 min-w-12 items-center justify-center rounded px-2 py-1 text-xs text-zinc-300 underline transition-colors hover:bg-zinc-800"
        >
          Link
        </button>
        <button
          type="button"
          title="Remove formatting"
          onMouseDown={(e) => { e.preventDefault(); exec({ label: '', title: '', command: 'removeFormat' }); }}
          className="ml-auto inline-flex min-h-12 min-w-12 items-center justify-center rounded px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-800"
        >
          Clear formatting
        </button>
      </div>

      <div className="relative">
        {isEmpty && !focused && (
          <p className="pointer-events-none absolute left-4 top-3 text-sm text-zinc-600">{placeholder}</p>
        )}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label="Section content"
          onInput={(e) => onChange((e.target as HTMLDivElement).innerHTML)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          // Pasting from a word processor otherwise brings its markup with it.
          onPaste={(e) => {
            e.preventDefault();
            const text = e.clipboardData.getData('text/plain');
            document.execCommand('insertText', false, text);
            onChange(ref.current?.innerHTML ?? '');
          }}
          className="prose-admin w-full px-4 py-3 text-sm text-zinc-200 focus:outline-none"
          style={{ minHeight }}
        />
      </div>
    </div>
  );
}

export default RichTextEditor;
