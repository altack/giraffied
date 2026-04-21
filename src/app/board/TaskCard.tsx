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
        'group rounded-md bg-zinc-900 px-2.5 py-2 text-sm',
        'border border-zinc-800 hover:border-zinc-700',
        'transition-colors cursor-default shadow-sm',
      )}
    >
      <div className="text-zinc-100 leading-snug line-clamp-3">{f['System.Title']}</div>
      {tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded-sm bg-zinc-800/80 px-1.5 py-0.5 text-[10px] text-zinc-300"
            >
              {tag}
            </span>
          ))}
          {tags.length > 3 && (
            <span className="text-[10px] text-zinc-500">+{tags.length - 3}</span>
          )}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={cn(
              'inline-flex items-center rounded-sm border px-1 py-0 text-[9px] font-medium uppercase tracking-wide shrink-0',
              type.bg,
              type.fg,
              type.border,
            )}
          >
            {type.label}
          </span>
          <span className="font-mono text-zinc-600 shrink-0">#{task.workItem.id}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {remaining != null && <span className="font-mono">{remaining}h</span>}
          <Assignee displayName={assignee?.displayName} />
        </div>
      </div>
    </article>
  );
}

function Assignee({ displayName }: { displayName: string | undefined }) {
  if (!displayName) {
    return (
      <span
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-zinc-700 text-[9px] text-zinc-600"
        title="Unassigned"
      >
        ?
      </span>
    );
  }
  const initials = initialsOf(displayName);
  const hue = hueFrom(displayName);
  return (
    <span
      className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold text-zinc-950"
      style={{ backgroundColor: `hsl(${hue} 70% 70%)` }}
      title={displayName}
    >
      {initials}
    </span>
  );
}
