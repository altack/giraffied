import { ChevronDown } from 'lucide-react';
import type { AdoWorkItem } from '@/ado/types';
import { cn } from '@/lib/cn';
import { parseTags, workItemTypeStyle } from './workItemVisuals';

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

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-zinc-950/95 backdrop-blur-sm border-b border-zinc-900 text-sm">
      <ChevronDown className="h-3.5 w-3.5 text-zinc-600 shrink-0" />
      <span
        className={cn(
          'inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide shrink-0',
          type.bg,
          type.fg,
          type.border,
        )}
      >
        {type.label}
      </span>
      <span className="text-[11px] font-mono text-zinc-500 shrink-0">#{row.id}</span>
      <span className="text-zinc-200 font-medium truncate">{f['System.Title']}</span>
      {tags.length > 0 && (
        <div className="flex items-center gap-1 shrink-0">
          {tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded-sm bg-zinc-800/80 px-1.5 py-0.5 text-[10px] text-zinc-300"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      <div className="ml-auto flex items-center gap-3 text-[11px] text-zinc-500 shrink-0">
        {points != null && <span className="font-mono">{points} pts</span>}
        <span>
          {totalTasks} {totalTasks === 1 ? 'task' : 'tasks'}
        </span>
      </div>
    </div>
  );
}

export function UnparentedBanner({ totalTasks }: { totalTasks: number }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-zinc-950/95 backdrop-blur-sm border-b border-zinc-900 text-sm">
      <ChevronDown className="h-3.5 w-3.5 text-zinc-600 shrink-0" />
      <span className="text-zinc-400 font-medium">Unparented</span>
      <span className="text-xs text-zinc-600">— tasks with no parent in this sprint</span>
      <div className="ml-auto text-[11px] text-zinc-500">
        {totalTasks} {totalTasks === 1 ? 'task' : 'tasks'}
      </div>
    </div>
  );
}
