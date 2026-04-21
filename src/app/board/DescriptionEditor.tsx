import 'trix';
import 'trix/dist/trix.css';
import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

type EditorVariant = 'default' | 'plain' | 'minimal';

/** Minimal React wrapper around Basecamp's Trix web component.
 *  Trix registers itself at module-load time via the `import 'trix'` side effect.
 *  Content is HTML in/out; ADO stores `System.Description` as HTML so no conversion
 *  is needed. File attachments are disabled — we intentionally don't handle uploads
 *  and would need an ADO attachment flow for that (out of scope for Phase 6).
 *
 *  `variant`:
 *   - `default` (form field) — border + toolbar always visible
 *   - `plain`   (description) — no border, toolbar hidden until focus
 *   - `minimal` (comment composer) — border, toolbar hidden until focus
 */
export function DescriptionEditor({
  value,
  onChange,
  placeholder = 'Describe this work item…',
  className,
  variant = 'default',
  autoFocus = false,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  variant?: EditorVariant;
  /** Focus the editor and place the cursor at the end once Trix initializes.
   *  Also unlocks this editor's toolbar via the existing trix-focus listener. */
  autoFocus?: boolean;
}) {
  const inputId = useId();
  const editorRef = useRef<HTMLElement | null>(null);
  // Starts as '' (not initial `value`) so the first effect pass runs an explicit
  // `editor.loadHTML(value)` instead of relying on Trix's hidden-input auto-load.
  // Auto-load is timing-fragile and in some cases the editor ends up showing the
  // HTML as plain text (unparsed). After the first load, we track what we emitted
  // so we don't re-load during our own onChange rebounds (which would nuke the
  // cursor position mid-type).
  const emittedHtml = useRef('');
  // Stabilise onChange so we don't re-subscribe the trix-change listener every render.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Per-editor sticky-toolbar state. Once *this* editor has been focused, its
  // toolbar stays visible for the rest of the component's lifetime (remount to
  // reset — e.g. the modal keys on task id). The blur→collapse→click-race bug
  // is strictly about the currently-interacted editor, so local state is all we
  // need; a shared context made *other* editors pop their toolbars unnecessarily.
  const [unlocked, setUnlocked] = useState(false);

  // Push external value changes (reset, switching selected task) into the editor.
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (value === emittedHtml.current) return;
    const apply = () => {
      const editor = (el as HTMLElement & { editor?: { loadHTML: (h: string) => void } })
        .editor;
      if (!editor) return;
      editor.loadHTML(value);
      emittedHtml.current = value;
    };
    if ((el as HTMLElement & { editor?: unknown }).editor) {
      apply();
    } else {
      el.addEventListener('trix-initialize', apply, { once: true });
      return () => el.removeEventListener('trix-initialize', apply);
    }
  }, [value]);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const handleChange = (e: Event) => {
      const html = (e.target as HTMLElement & { value: string }).value;
      emittedHtml.current = html;
      onChangeRef.current(html);
    };
    // Block attachment drops + paste; we don't handle uploads yet.
    const handleFile = (e: Event) => e.preventDefault();
    // First focus unlocks this editor's toolbar for the rest of its lifetime,
    // so the button-jump race (blur → toolbar collapse → button moves) is gone.
    const handleFocus = () => setUnlocked(true);
    el.addEventListener('trix-change', handleChange);
    el.addEventListener('trix-file-accept', handleFile);
    el.addEventListener('trix-focus', handleFocus);
    return () => {
      el.removeEventListener('trix-change', handleChange);
      el.removeEventListener('trix-file-accept', handleFile);
      el.removeEventListener('trix-focus', handleFocus);
    };
  }, []);

  // Auto-focus after Trix has initialized, putting the caret at the end of the
  // existing content. Runs once on mount. The subsequent trix-focus event flips
  // `unlocked` → true so the toolbar is already visible in the first paint.
  useEffect(() => {
    if (!autoFocus) return;
    const el = editorRef.current;
    if (!el) return;
    const focusAtEnd = () => {
      const editor = (
        el as HTMLElement & {
          editor?: {
            getDocument: () => { toString: () => string };
            setSelectedRange: (r: [number, number]) => void;
          };
        }
      ).editor;
      if (editor) {
        const len = editor.getDocument().toString().length;
        editor.setSelectedRange([len, len]);
      }
      (el as HTMLElement).focus?.();
      setUnlocked(true);
    };
    if ((el as HTMLElement & { editor?: unknown }).editor) {
      focusAtEnd();
    } else {
      el.addEventListener('trix-initialize', focusAtEnd, { once: true });
      return () => el.removeEventListener('trix-initialize', focusAtEnd);
    }
  }, [autoFocus]);

  return (
    <div
      className={cn(
        'jfd-trix rounded-md overflow-hidden transition-colors duration-150',
        variant === 'default' &&
          'border border-white/[0.08] bg-white/[0.03] focus-within:border-indigo-400/40 focus-within:ring-2 focus-within:ring-indigo-400/15',
        variant === 'plain' &&
          'jfd-trix--plain border border-transparent hover:bg-white/[0.02] focus-within:bg-white/[0.03] focus-within:border-indigo-400/40 focus-within:ring-2 focus-within:ring-indigo-400/15',
        variant === 'minimal' &&
          'jfd-trix--minimal border border-white/[0.08] bg-white/[0.03] focus-within:border-indigo-400/40 focus-within:ring-2 focus-within:ring-indigo-400/15',
        unlocked && (variant === 'plain' || variant === 'minimal') && 'jfd-trix--open',
        className,
      )}
    >
      <input id={inputId} type="hidden" defaultValue={value} />
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <trix-editor
        ref={editorRef as never}
        input={inputId}
        placeholder={placeholder}
        class="trix-content"
      />
    </div>
  );
}
