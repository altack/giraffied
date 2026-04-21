import 'trix';
import 'trix/dist/trix.css';
import { useEffect, useId, useRef } from 'react';
import { cn } from '@/lib/cn';

/** Minimal React wrapper around Basecamp's Trix web component.
 *  Trix registers itself at module-load time via the `import 'trix'` side effect.
 *  Content is HTML in/out; ADO stores `System.Description` as HTML so no conversion
 *  is needed. File attachments are disabled — we intentionally don't handle uploads
 *  and would need an ADO attachment flow for that (out of scope for Phase 6). */
export function DescriptionEditor({
  value,
  onChange,
  placeholder = 'Describe this work item…',
  className,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const inputId = useId();
  const editorRef = useRef<HTMLElement | null>(null);
  // Remember the last HTML we emitted so we don't re-load the editor on our own updates
  // (which would nuke the cursor position mid-type).
  const emittedHtml = useRef(value);
  // Stabilise onChange so we don't re-subscribe the trix-change listener every render.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

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
    el.addEventListener('trix-change', handleChange);
    el.addEventListener('trix-file-accept', handleFile);
    return () => {
      el.removeEventListener('trix-change', handleChange);
      el.removeEventListener('trix-file-accept', handleFile);
    };
  }, []);

  return (
    <div
      className={cn(
        'jfd-trix rounded-md border border-white/[0.08] bg-white/[0.03] overflow-hidden',
        'focus-within:border-indigo-400/40 focus-within:ring-2 focus-within:ring-indigo-400/15',
        'transition-colors duration-150',
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
