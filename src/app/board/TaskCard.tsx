import type { CSSProperties, MouseEvent } from 'react';
import type { DraggableProvided, DraggableStateSnapshot } from '@hello-pangea/dnd';
import type { TaskOnBoard } from '@/ado/hooks/useTaskboard';
import { cn } from '@/lib/cn';
import { parseTags, workItemTypeStyle } from './workItemVisuals';
import { CopyLinkButton } from './CopyLinkButton';
import { Avatar } from './Avatar';

export function TaskCard({
  task,
  dragProvided,
  dragSnapshot,
  onOpen,
}: {
  task: TaskOnBoard;
  dragProvided?: DraggableProvided;
  dragSnapshot?: DraggableStateSnapshot;
  onOpen?: (task: TaskOnBoard) => void;
}) {
  const f = task.workItem.fields;
  const type = workItemTypeStyle(f['System.WorkItemType']);
  const assignee = f['System.AssignedTo'];
  const remaining = f['Microsoft.VSTS.Scheduling.RemainingWork'];
  const tags = parseTags(f['System.Tags']);

  const isDragging = dragSnapshot?.isDragging ?? false;

  // hello-pangea/dnd lets the click through when the pointer didn't move past its drag
  // threshold. We open the modal on click; CopyLinkButton stops propagation, so it
  // doesn't double-trigger.
  const handleClick = (e: MouseEvent<HTMLElement>) => {
    if (!onOpen) return;
    if (dragSnapshot?.isDragging) return;
    if ((e.target as HTMLElement).closest('[data-no-open]')) return;
    onOpen(task);
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
      {...(dragProvided?.dragHandleProps ?? {})}
      style={style}
      onClick={handleClick}
      className={cn(
        'group relative rounded-md px-3 py-2.5 text-sm cursor-grab active:cursor-grabbing',
        'bg-[#141418] border border-white/[0.06]',
        'hover:bg-[#17171c] hover:border-white/[0.10]',
        'transition-colors duration-150',
        'lit-top',
        isDragging && 'shadow-xl shadow-black/40 ring-1 ring-indigo-400/30 bg-[#17171c]',
      )}
    >
      <div
        data-no-open
        className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-100"
      >
        <CopyLinkButton workItemId={task.workItem.id} />
      </div>
      <div className="text-[13.5px] leading-[1.4] text-zinc-100 line-clamp-3 pr-5">
        {f['System.Title']}
      </div>
      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded-sm bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-zinc-400"
            >
              {tag}
            </span>
          ))}
          {tags.length > 3 && (
            <span className="text-[10px] text-zinc-600">+{tags.length - 3}</span>
          )}
        </div>
      )}
      <div className="mt-2.5 flex items-center justify-between text-[11px] text-zinc-500">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="h-1.5 w-1.5 rounded-full shrink-0"
            style={{ backgroundColor: type.dot }}
            aria-hidden
          />
          <span className="text-zinc-400 shrink-0">{type.label}</span>
          <span className="text-zinc-700 shrink-0">·</span>
          <span className="mono text-zinc-600 shrink-0">#{task.workItem.id}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {remaining != null && <span className="mono text-zinc-500">{remaining}h</span>}
          <Avatar identity={assignee} size="sm" />
        </div>
      </div>
    </article>
  );
}
