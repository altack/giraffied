import { lazy, Suspense } from 'react';
import { cn } from '@/lib/cn';
import type { UploadedAttachment } from './DescriptionEditor.lazy';

// Tiptap + StarterKit + ProseMirror is ~70kb gz on its own. We never need it
// on the initial board paint — only when the user opens the modal or the
// create-task dialog. React.lazy moves the entire editor (and its toolbar)
// into a separate chunk that loads on first mount.
const Impl = lazy(() =>
  import('./DescriptionEditor.lazy').then((m) => ({ default: m.DescriptionEditor })),
);

type EditorVariant = 'default' | 'plain' | 'minimal';

/** Public re-export of the Tiptap-backed editor with a tiny placeholder skeleton
 *  shown while the chunk loads. Keeps the call-site API unchanged. */
export function DescriptionEditor(props: {
  value: string;
  onChange: (html: string) => void;
  onEscape?: () => void;
  uploadFile?: (file: File) => Promise<UploadedAttachment>;
  placeholder?: string;
  className?: string;
  variant?: EditorVariant;
  autoFocus?: boolean;
}) {
  return (
    <Suspense fallback={<EditorSkeleton variant={props.variant ?? 'default'} className={props.className} />}>
      <Impl {...props} />
    </Suspense>
  );
}

function EditorSkeleton({
  variant,
  className,
}: {
  variant: EditorVariant;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        'jfd-tt rounded-md overflow-hidden',
        variant === 'default' && 'border border-[var(--color-hairline-strong)] bg-[var(--color-overlay-soft)]',
        variant === 'minimal' && 'border border-[var(--color-hairline-strong)] bg-[var(--color-overlay-soft)]',
        variant === 'plain' && 'border border-transparent',
        className,
      )}
      style={{ minHeight: variant === 'plain' ? 40 : 88 }}
    />
  );
}
