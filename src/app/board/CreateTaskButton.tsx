import { type MouseEvent } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Plus-icon button that lives at the right edge of every swimlane banner.
 *  Always visible (muted) to keep the "add a task" affordance discoverable —
 *  the copy/open cluster is hover-reveal, but create is the primary write
 *  action so it stays in sight. */
export function CreateTaskButton({
  onClick,
  className,
  title = 'Add task to this lane',
}: {
  onClick: () => void;
  className?: string;
  title?: string;
}) {
  function handleClick(e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    e.preventDefault();
    onClick();
  }
  return (
    <button
      type="button"
      onClick={handleClick}
      title={title}
      aria-label={title}
      className={cn(
        'inline-flex h-5 w-5 items-center justify-center rounded',
        'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-overlay-2)]',
        'transition-colors duration-100',
        className,
      )}
    >
      <Plus className="h-3.5 w-3.5" />
    </button>
  );
}
