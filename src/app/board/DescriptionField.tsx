import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { DescriptionEditor } from './DescriptionEditor';

/** Wrapper that presents the description as **rendered HTML** by default and only
 *  mounts Trix when the user clicks to edit. Trix is lossy on `loadHTML` (it drops
 *  tables, images, inline styles, underline, h2+, etc.) so keeping view-mode
 *  pure-HTML preserves ADO's original fidelity until an actual edit starts.
 *
 *  Uncontrolled edit-mode toggle: parent controls `value`; this component flips
 *  itself between view/edit on click and Escape. Blur does not exit edit mode —
 *  users routinely interact with the floating toolbar, which causes intermediate
 *  blurs that would be disruptive to bail on. */
export function DescriptionField({
  value,
  onChange,
  placeholder = 'Add a description…',
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Collapse back to view-mode on Escape when focus is inside our subtree.
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (!wrapRef.current?.contains(document.activeElement)) return;
      e.stopPropagation();
      setEditing(false);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [editing]);

  // Click-outside exits edit mode. We don't use blur because the Trix toolbar is
  // inside the same wrapper, so intermediate blurs during formatting are normal.
  useEffect(() => {
    if (!editing) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (wrapRef.current.contains(e.target as Node)) return;
      setEditing(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [editing]);

  if (editing) {
    return (
      <div ref={wrapRef}>
        <DescriptionEditor
          value={value}
          onChange={onChange}
          variant="default"
          placeholder={placeholder}
          autoFocus
        />
      </div>
    );
  }

  const isEmpty = !value || value.trim() === '' || /^<(p|div|br)[^>]*>(\s|&nbsp;)*<\/?(p|div)?>?$/i.test(value.trim());

  return (
    <div
      ref={wrapRef}
      role="button"
      tabIndex={0}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setEditing(true);
        }
      }}
      className={cn(
        'jfd-description-body cursor-text rounded-md px-3 py-2 min-h-[40px]',
        'text-[13px] leading-[1.5] text-zinc-200',
        'border border-transparent hover:bg-white/[0.02] hover:border-white/[0.04]',
        'focus-visible:outline-none focus-visible:bg-white/[0.03] focus-visible:border-indigo-400/30 focus-visible:ring-2 focus-visible:ring-indigo-400/15',
        'transition-colors duration-150',
        isEmpty && 'text-zinc-600 italic',
      )}
    >
      {isEmpty ? (
        placeholder
      ) : (
        // ADO-stored HTML (same provenance as comments). Rendered as-is so tables,
        // images, and inline formatting survive.
        // eslint-disable-next-line react/no-danger
        <div dangerouslySetInnerHTML={{ __html: value }} />
      )}
    </div>
  );
}
