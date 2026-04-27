import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react';
import type { DraggableProvided, DraggableStateSnapshot } from '@hello-pangea/dnd';
import type { TaskOnBoard } from '@/ado/hooks/useTaskboard';
import { cn } from '@/lib/cn';
import { parseTags, workItemTypeStyle } from './workItemVisuals';
import { CopyLinkButton } from './CopyLinkButton';
import { OpenLinkButton } from './OpenLinkButton';
import { Avatar } from './Avatar';
import { isSelectingTextIn } from './selection';

export function TaskCard({
  task,
  dragProvided,
  dragSnapshot,
  onOpen,
  dragDisabled,
  isRecentlyFocused,
}: {
  task: TaskOnBoard;
  dragProvided?: DraggableProvided;
  dragSnapshot?: DraggableStateSnapshot;
  onOpen?: (task: TaskOnBoard) => void;
  dragDisabled?: boolean;
  /** Brief pulsing ring after the lane was just expanded or its modal closed —
   *  helps the user re-locate the card after returning to the board. */
  isRecentlyFocused?: boolean;
}) {
  const f = task.workItem.fields;
  const type = workItemTypeStyle(f['System.WorkItemType']);
  const assignee = f['System.AssignedTo'];
  const remaining = f['Microsoft.VSTS.Scheduling.RemainingWork'];
  const tags = parseTags(f['System.Tags']);

  const isDragging = dragSnapshot?.isDragging ?? false;

  // Only the title opens the modal — the rest of the card is "empty" to clicks
  // (it still receives drag gestures via dragHandleProps on the article). This
  // matches the banner below, where clicking the title opens the parent and
  // clicking elsewhere collapses.
  const handleTitleClick = (e: MouseEvent<HTMLElement>) => {
    if (!onOpen) return;
    if (dragSnapshot?.isDragging) return;
    if (isSelectingTextIn(e.currentTarget)) return;
    e.stopPropagation();
    onOpen(task);
  };

  const handleTitleKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (!onOpen) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen(task);
    }
  };

  // Zero the drop animation. Even with the flushSync overlay trick we still see a
  // brief flicker because the library's FLIP transition runs before React's external-
  // store observers settle. Setting `transitionDuration: 0.001s` while `isDropAnimating`
  // makes the transition imperceptible, per the hello-pangea/dnd drop-animation guide.
  const style: CSSProperties | undefined = dragProvided?.draggableProps.style
    ? {
        ...dragProvided.draggableProps.style,
        ...(dragSnapshot?.isDropAnimating ? { transitionDuration: '0.001s' } : {}),
      }
    : undefined;

  return (
    <article
      ref={dragProvided?.innerRef}
      {...(dragProvided?.draggableProps ?? {})}
      style={style}
      className={cn(
        'group relative rounded-md text-sm',
        // Frosted-glass surface: a thin overlay film + backdrop blur. The
        // overlay tokens are theme-aware (white-on-dark / black-on-light), so
        // the card is faintly visible against any canvas while still letting
        // the cell's lane-hue gradient bleed through underneath.
        'bg-[var(--color-overlay-soft)] backdrop-blur-md border border-[var(--color-hairline)]',
        'hover:bg-[var(--color-overlay-1)] hover:border-[var(--color-hairline-strong)]',
        'transition-colors duration-150',
        'lit-top',
        isDragging && 'shadow-xl shadow-black/40 ring-1 ring-indigo-400/30 bg-[var(--color-overlay-2)]',
        isRecentlyFocused && !isDragging && 'jfd-focus-hint',
      )}
    >
      {/* Drag trigger layer. hello-pangea/dnd binds its mousedown sensor on
       * `window` in capture phase, then walks up from `event.target` via
       * `closest('[data-rfd-drag-handle-context-id]')`. So to make a child
       * element NOT start a drag, the drag handle has to be a *sibling* (not an
       * ancestor) of that child — no React `stopPropagation` or `preventDefault`
       * on the child can intercept the sensor without also killing text
       * selection. This overlay is the handle; the content layer below it is
       * populated with `pointer-events:auto` islands (title, type+id row,
       * buttons) that block hit-through, while the containers stay
       * `pointer-events:none` so the card's "hollow" areas — padding, gaps,
       * tags row, right-side metadata — route their mousedown here and start
       * the drag normally. */}
      <div
        {...(dragProvided?.dragHandleProps ?? {})}
        aria-label="Drag card"
        className={cn(
          'absolute inset-0 rounded-md',
          'focus:outline-none focus-visible:ring-1 focus-visible:ring-indigo-400/40',
          dragDisabled ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing',
        )}
      />
      <div className="relative px-3 py-2.5 pointer-events-none">
        <div className="flex items-start gap-1.5">
          <span
            role="button"
            tabIndex={onOpen ? 0 : -1}
            onClick={handleTitleClick}
            onKeyDown={handleTitleKeyDown}
            className={cn(
              'min-w-0 block text-left select-text pointer-events-auto',
              // Safe zone: extend the click target a few px past the text on
              // each side so a mousedown that lands just outside the glyphs
              // still starts a selection instead of falling through to the
              // drag layer. Negative margin cancels the padding in flex layout
              // so neighbors don't shift.
              'px-1 -mx-1',
              'text-[13.5px] leading-[1.4] text-[var(--color-ink)] line-clamp-3',
              onOpen && 'cursor-pointer hover:underline underline-offset-2 decoration-[var(--color-ink-dim)]',
              'focus:outline-none focus-visible:underline focus-visible:decoration-[var(--color-ink-muted)]',
            )}
          >
            {f['System.Title']}
          </span>
          <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-100 pointer-events-auto">
            <CopyLinkButton workItemId={task.workItem.id} />
            <OpenLinkButton workItemId={task.workItem.id} />
          </div>
        </div>
        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-sm bg-[var(--color-overlay-1)] px-1.5 py-0.5 text-[10px] text-[var(--color-ink-muted)]"
              >
                {tag}
              </span>
            ))}
            {tags.length > 3 && (
              <span className="text-[10px] text-[var(--color-ink-dim)]">+{tags.length - 3}</span>
            )}
          </div>
        )}
        <div className="mt-2.5 flex items-center justify-between text-[11px] text-[var(--color-ink-muted)]">
          <div className="flex items-center gap-1.5 min-w-0 select-text pointer-events-auto">
            <span
              className="h-1.5 w-1.5 rounded-full shrink-0"
              style={{ backgroundColor: type.dot }}
              aria-hidden
            />
            <span className="text-[var(--color-ink-muted)] shrink-0">{type.label}</span>
            <span className="text-[var(--color-ink-dim)] shrink-0">·</span>
            <span className="mono text-[var(--color-ink-dim)] shrink-0">#{task.workItem.id}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {remaining != null && <span className="mono text-[var(--color-ink-muted)]">{remaining}h</span>}
            <Avatar identity={assignee} size="sm" />
          </div>
        </div>
      </div>
    </article>
  );
}
