'use client';

import { useCallback, useEffect, useRef } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import type { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

/**
 * Rich text editor for page content sections.
 *
 * Built on TipTap (ProseMirror). It replaced a hand-rolled contentEditable that
 * drove `document.execCommand`: that API is deprecated, and its toolbar bound
 * `onMouseDown` only, which is unreliable on touch — see BUGS.md B10. TipTap
 * handles both input types itself.
 *
 * The output is HTML. It is sanitised server-side against an allowlist before
 * storage (utils/sanitizeHtml), so this component is a convenience rather than
 * the security boundary.
 */

/** Only these schemes may appear in a link. Mirrors the server's allowlist. */
const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|\/|#)/i;

const DEBOUNCE_MS = 500;

interface ToolbarItem {
  label: string;
  title: string;
  /** Marks the button as active when this node/mark is at the cursor. */
  active: { name: string; attrs?: Record<string, unknown> };
  run: (editor: Editor) => void;
  className?: string;
}

const ITEMS: readonly ToolbarItem[] = [
  {
    label: 'H2', title: 'Heading', className: 'font-bold',
    active: { name: 'heading', attrs: { level: 2 } },
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    label: 'H3', title: 'Subheading', className: 'font-semibold',
    active: { name: 'heading', attrs: { level: 3 } },
    run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    label: 'B', title: 'Bold', className: 'font-bold',
    active: { name: 'bold' },
    run: (e) => e.chain().focus().toggleBold().run(),
  },
  {
    label: 'I', title: 'Italic', className: 'italic',
    active: { name: 'italic' },
    run: (e) => e.chain().focus().toggleItalic().run(),
  },
  {
    label: '•', title: 'Bulleted list',
    active: { name: 'bulletList' },
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    label: '1.', title: 'Numbered list',
    active: { name: 'orderedList' },
    run: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    label: '❝', title: 'Quote',
    active: { name: 'blockquote' },
    run: (e) => e.chain().focus().toggleBlockquote().run(),
  },
  {
    label: '‹›', title: 'Code', className: 'font-mono',
    active: { name: 'code' },
    run: (e) => e.chain().focus().toggleCode().run(),
  },
];

const BUTTON_BASE =
  'inline-flex min-h-12 min-w-12 items-center justify-center rounded px-2 text-xs transition-colors';

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
  // The newest HTML, held so a pending debounce can be flushed on demand.
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Kept in a ref so the editor's onUpdate closure never calls a stale prop.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const flush = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (pending.current !== null) {
      onChangeRef.current(pending.current);
      pending.current = null;
    }
  }, []);

  const editor = useEditor({
    extensions: [StarterKit.configure({ link: { openOnClick: false } })],
    content: value,
    // Next renders this on the server first; deferring the first paint avoids
    // a hydration mismatch.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'prose-admin w-full px-4 py-3 text-sm text-zinc-200 focus:outline-none',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'Section content',
      },
    },
    onUpdate: ({ editor: instance }) => {
      pending.current = instance.getHTML();
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        if (pending.current !== null) {
          onChangeRef.current(pending.current);
          pending.current = null;
        }
      }, DEBOUNCE_MS);
    },
    // Saving is a click, which blurs the editor first — so flushing here means
    // the parent always holds the final text before the save request goes out.
    onBlur: flush,
  });

  // Any edit still waiting out its debounce when the editor goes away would
  // otherwise be lost.
  useEffect(() => flush, [flush]);

  // Follows the value when it changes from outside, e.g. switching sections.
  // Guarded against the editor's own output to avoid a feedback loop.
  useEffect(() => {
    if (!editor) return;
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value || '', { emitUpdate: false });
    }
    // Deliberately keyed on value alone: reacting to `editor` would re-run on
    // every transaction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const state = useEditorState({
    editor,
    selector: ({ editor: instance }) => ({
      active: ITEMS.map((item) => Boolean(instance?.isActive(item.active.name, item.active.attrs))),
      isLink: Boolean(instance?.isActive('link')),
      isEmpty: Boolean(instance?.isEmpty),
    }),
  });

  const toggleLink = useCallback(() => {
    if (!editor) return;
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const url = window.prompt('Link address (https://…)');
    if (!url) return;
    const trimmed = url.trim();
    if (!SAFE_HREF.test(trimmed)) {
      window.alert('Links must start with https://, mailto:, tel:, / or #');
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: trimmed }).run();
  }, [editor]);

  return (
    <div className="rounded-lg border border-zinc-800 focus-within:border-emerald-500/50">
      {/* Wraps rather than scrolls, so every control stays reachable on a
          narrow screen. Each button meets the 48px touch minimum. */}
      <div className="flex flex-wrap gap-1 border-b border-zinc-800 p-2">
        {ITEMS.map((item, index) => (
          <button
            key={item.label}
            type="button"
            title={item.title}
            aria-label={item.title}
            aria-pressed={state?.active[index] ?? false}
            disabled={!editor}
            onClick={() => editor && item.run(editor)}
            className={`${BUTTON_BASE} ${item.className ?? ''} ${
              state?.active[index]
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'text-zinc-300 hover:bg-zinc-800'
            }`}
          >
            {item.label}
          </button>
        ))}

        <button
          type="button"
          title={state?.isLink ? 'Remove link' : 'Add a link'}
          aria-label={state?.isLink ? 'Remove link' : 'Add a link'}
          aria-pressed={state?.isLink ?? false}
          disabled={!editor}
          onClick={toggleLink}
          className={`${BUTTON_BASE} underline ${
            state?.isLink ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-300 hover:bg-zinc-800'
          }`}
        >
          Link
        </button>

        <button
          type="button"
          title="Remove formatting"
          aria-label="Remove formatting"
          disabled={!editor}
          onClick={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()}
          className={`${BUTTON_BASE} ml-auto text-zinc-500 hover:bg-zinc-800`}
        >
          Clear
        </button>
      </div>

      <div className="relative">
        {state?.isEmpty && (
          <p className="pointer-events-none absolute left-4 top-3 text-sm text-zinc-600">
            {placeholder}
          </p>
        )}
        <EditorContent editor={editor} style={{ minHeight }} />
      </div>
    </div>
  );
}

export default RichTextEditor;
