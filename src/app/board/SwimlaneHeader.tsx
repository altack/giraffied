import type { AdoWorkItem } from '@/ado/types';
import { cn } from '@/lib/cn';
import { parseTags, workItemTypeStyle } from './workItemVisuals';

export function SwimlaneHeader({ row, totalTasks }: { row: AdoWorkItem; totalTasks: number }) {
  const f = row.fields;
  const type = workItemTypeStyle(f['System.WorkItemType']);
  const points = f['Microsoft.VSTS.Scheduling.StoryPoints'];
  const tags = parseTags(f['System.Tags']);

  return (
    <div className="px-3 py-3 border-r border-zinc-800">
      <div className="flex items-center gap-2 mb-1.5">
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
        <span className="text-[11px] font-mono text-zinc-500">#{row.id}</span>
      </div>
      <div className="text-sm text-zinc-100 leading-snug font-medium line-clamp-3">
        {f['System.Title']}
      </div>
      <div className="mt-2 flex items-center gap-3 text-[11px] text-zinc-500">
        <span>
          {totalTasks} {totalTasks === 1 ? 'task' : 'tasks'}
        </span>
        {points != null && <span className="font-mono">{points} pts</span>}
      </div>
      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded-sm bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300"
            >
              {tag}
            </span>
          ))}
          {tags.length > 2 && (
            <span className="text-[10px] text-zinc-500">+{tags.length - 2}</span>
          )}
        </div>
      )}
    </div>
  );
}

export function UnparentedSwimlaneHeader({ totalTasks }: { totalTasks: number }) {
  return (
    <div className="px-3 py-3 border-r border-zinc-800">
      <div className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1">Unparented</div>
      <div className="text-sm text-zinc-400 leading-snug">Tasks without a parent in this sprint</div>
      <div className="mt-2 text-[11px] text-zinc-500">
        {totalTasks} {totalTasks === 1 ? 'task' : 'tasks'}
      </div>
    </div>
  );
}
