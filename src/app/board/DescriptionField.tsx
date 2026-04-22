import { useState } from 'react';
import { cn } from '@/lib/cn';
import { DescriptionEditor } from './DescriptionEditor';

/** Wrapper that presents the description as **rendered HTML** by default and only
 *  mounts Trix when the user clicks to edit. Trix is lossy on `loadHTML` (it drops
 *  tables, images, inline styles, underline, h2+, etc.) so keeping view-mode
 *  pure-HTML preserves ADO's original fidelity until an actual edit starts.
 *
 *  Once in edit mode we stay there for the rest of the modal's life — clicking
 *  outside or pressing Escape does **not** bail back to view mode. Early iterations
 *  did, but Trix's floating toolbar causes routine intermediate blurs that made
 *  that feel hostile (click a formatting button, editor unmounts). Modal close
 *  resets this state since the whole subtree remounts on the next open. */
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

  if (editing) {
    return (
      <DescriptionEditor
        value={value}
        onChange={onChange}
        variant="default"
        placeholder={placeholder}
        autoFocus
      />
    );
  }

  const isEmpty = !value || value.trim() === '' || /^<(p|div|br)[^>]*>(\s|&nbsp;)*<\/?(p|div)?>?$/i.test(value.trim());

  return (
    <div
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
