import { useState } from 'react';
import { cn } from '@/lib/cn';
import { DescriptionEditor } from './DescriptionEditor';
import type { UploadedAttachment } from './DescriptionEditor.lazy';
import { RichTextRenderer } from './RichTextRenderer';

/** Wrapper that presents the description as **rendered HTML** by default and only
 *  mounts the editor when the user clicks to edit.
 *
 *  Esc inside the editor exits back to view mode (via DescriptionEditor's
 *  onEscape callback). The editor stops Esc from propagating, so the modal's
 *  window-level Esc-to-close listener doesn't fire — exiting edit mode is the
 *  natural undo for "I clicked here by accident." */
export function DescriptionField({
  value,
  onChange,
  uploadFile,
  placeholder = 'Add a description…',
}: {
  value: string;
  onChange: (html: string) => void;
  uploadFile?: (file: File) => Promise<UploadedAttachment>;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <DescriptionEditor
        value={value}
        onChange={onChange}
        onEscape={() => setEditing(false)}
        uploadFile={uploadFile}
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
      onClick={(e) => {
        // Defensive: even with the renderer's own stopPropagation, never
        // enter edit mode on clicks targeting interactive elements (links
        // open in a new tab, images open the lightbox, video controls play).
        const target = e.target as HTMLElement | null;
        if (target?.closest('a, img, video, button')) return;
        setEditing(true);
      }}
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
        // RichTextRenderer intercepts link/image/video clicks (open new tab,
        // lightbox, inline video) so they don't bubble up and trigger edit mode.
        // Plain-text clicks still bubble to the wrapper, which is the intended
        // way to enter edit mode.
        <RichTextRenderer html={value} />
      )}
    </div>
  );
}
