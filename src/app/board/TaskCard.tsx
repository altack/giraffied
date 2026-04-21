import type { TaskOnBoard } from '@/ado/hooks/useTaskboard';
import { cn } from '@/lib/cn';
import { hueFrom, initialsOf, parseTags, workItemTypeStyle } from './workItemVisuals';

export function TaskCard({ task }: { task: TaskOnBoard }) {
  const f = task.workItem.fields;
  const type = workItemTypeStyle(f['System.WorkItemType']);
  const assignee = f['System.AssignedTo'];
  const remaining = f['Microsoft.VSTS.Scheduling.RemainingWork'];
  const tags = parseTags(f['System.Tags']);

  return (
    <article
      className={cn(
        'group rounded-md border border-zinc-800 bg-zinc-900/80 p-3 text-sm shadow-sm',
        'hover:border-zinc-700 hover:bg-zinc-900 transition-colors cursor-default',
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span
          className={cn(
            'inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
            type.bg,
            type.fg,
            type.border,
          )}
        >
          {type.label}
        </span>
        <span className="text-[11px] font-mono text-zinc-500">#{task.workItem.id}</span>
      </div>
      <div className="text-zinc-100 leading-snug line-clamp-3">{f['System.Title']}</div>
      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded-sm bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300"
            >
              {tag}
            </span>
          ))}
          {tags.length > 3 && (
            <span className="text-[10px] text-zinc-500">+{tags.length - 3}</span>
          )}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between text-xs text-zinc-400">
        <AssigneePill displayName={assignee?.displayName} />
        {remaining != null && <span className="font-mono">{remaining}h</span>}
      </div>
    </article>
  );
}

function AssigneePill({ displayName }: { displayName: string | undefined }) {
  if (!displayName) {
    return <span className="text-zinc-600 italic">Unassigned</span>;
  }
  const initials = initialsOf(displayName);
  const hue = hueFrom(displayName);
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold text-zinc-950"
        style={{ backgroundColor: `hsl(${hue} 70% 70%)` }}
        title={displayName}
      >
        {initials}
      </span>
      <span className="truncate max-w-[120px]">{displayName}</span>
    </span>
  );
}
