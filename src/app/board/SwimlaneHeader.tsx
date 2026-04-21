import { ChevronDown } from 'lucide-react';
import type { AdoWorkItem } from '@/ado/types';
import { avatarColor, initialsOf, parseTags, workItemTypeStyle } from './workItemVisuals';

export function SwimlaneBanner({
  row,
  totalTasks,
  points,
}: {
  row: AdoWorkItem;
  totalTasks: number;
  points?: number;
}) {
  const f = row.fields;
  const type = workItemTypeStyle(f['System.WorkItemType']);
  const tags = parseTags(f['System.Tags']);
  const assignee = f['System.AssignedTo'];

  return (
    <div className="flex items-center gap-2 py-1 text-[13.5px]">
      <ChevronDown className="h-3.5 w-3.5 text-zinc-600 shrink-0" />
      <span
        className="h-1.5 w-1.5 rounded-full shrink-0"
        style={{ backgroundColor: type.dot }}
        aria-hidden
      />
      <span className="text-zinc-400 shrink-0">{type.label}</span>
      <span className="mono text-[11px] text-zinc-600 shrink-0">#{row.id}</span>
      <span className="text-zinc-100 font-medium truncate">{f['System.Title']}</span>
      <span className="text-[11px] text-zinc-600 shrink-0">
        · {totalTasks} {totalTasks === 1 ? 'task' : 'tasks'}
      </span>
      {tags.length > 0 && (
        <div className="flex items-center gap-1 shrink-0">
          {tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded-sm bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-zinc-400"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      {points != null && (
        <span className="mono text-[11px] text-zinc-500 shrink-0">· {points} pts</span>
      )}
      {assignee?.displayName && <TinyAvatar displayName={assignee.displayName} />}
    </div>
  );
}

export function UnparentedBanner({ totalTasks }: { totalTasks: number }) {
  return (
    <div className="flex items-center gap-2 py-1 text-[13.5px]">
      <ChevronDown className="h-3.5 w-3.5 text-zinc-600 shrink-0" />
      <span className="text-zinc-300 font-medium">Everything else</span>
      <span className="text-[11px] text-zinc-600 shrink-0">
        · {totalTasks} {totalTasks === 1 ? 'task' : 'tasks'} with no parent in this sprint
      </span>
    </div>
  );
}

function TinyAvatar({ displayName }: { displayName: string }) {
  const { bg, fg } = avatarColor(displayName);
  return (
    <span
      className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-semibold shrink-0"
      style={{ backgroundColor: bg, color: fg }}
      title={displayName}
    >
      {initialsOf(displayName)}
    </span>
  );
}
