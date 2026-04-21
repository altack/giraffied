import type { TaskOnBoard } from '@/ado/hooks/useTaskboard';
import { cn } from '@/lib/cn';
import { parseTags, workItemTypeStyle } from './workItemVisuals';
import { CopyLinkButton } from './CopyLinkButton';
import { Avatar } from './Avatar';

export function TaskCard({ task }: { task: TaskOnBoard }) {
  const f = task.workItem.fields;
  const type = workItemTypeStyle(f['System.WorkItemType']);
  const assignee = f['System.AssignedTo'];
  const remaining = f['Microsoft.VSTS.Scheduling.RemainingWork'];
  const tags = parseTags(f['System.Tags']);

  return (
    <article
      className={cn(
        'group relative rounded-md px-3 py-2.5 text-sm cursor-default',
        'bg-[#141418] border border-white/[0.06]',
        'hover:bg-[#17171c] hover:border-white/[0.10]',
        'transition-colors duration-150',
        'lit-top',
      )}
    >
      <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-100">
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
