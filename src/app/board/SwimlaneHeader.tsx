import { type KeyboardEvent, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import type { AdoWorkItem } from '@/ado/types';
import { cn } from '@/lib/cn';
import { parseTags, workItemTypeStyle } from './workItemVisuals';
import { CopyLinkButton } from './CopyLinkButton';
import { Avatar } from './Avatar';

function BannerShell({
  collapsed,
  onToggle,
  children,
}: {
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  function handleKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle();
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={handleKey}
      aria-expanded={!collapsed}
      className={cn(
        'group flex w-full items-center gap-2 py-1 text-[13.5px] text-left cursor-pointer',
        'rounded-md px-1 -mx-1 hover:bg-white/[0.03] transition-colors',
        'focus:outline-none focus-visible:ring-1 focus-visible:ring-indigo-400/40',
      )}
    >
      <ChevronDown
        className={cn(
          'h-3.5 w-3.5 text-zinc-500 shrink-0 transition-transform duration-150',
          collapsed && '-rotate-90',
        )}
      />
      {children}
    </div>
  );
}

export function SwimlaneBanner({
  row,
  totalTasks,
  points,
  collapsed,
  onToggle,
}: {
  row: AdoWorkItem;
  totalTasks: number;
  points?: number;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const f = row.fields;
  const type = workItemTypeStyle(f['System.WorkItemType']);
  const tags = parseTags(f['System.Tags']);
  const assignee = f['System.AssignedTo'];

  return (
    <BannerShell collapsed={collapsed} onToggle={onToggle}>
      <span
        className="h-1.5 w-1.5 rounded-full shrink-0"
        style={{ backgroundColor: type.dot }}
        aria-hidden
      />
      <span className="text-zinc-400 shrink-0">{type.label}</span>
      <span className="mono text-[11px] text-zinc-600 shrink-0">#{row.id}</span>
      <span className="text-zinc-100 font-medium truncate">{f['System.Title']}</span>
      <span className="shrink-0">
        <CopyLinkButton workItemId={row.id} />
      </span>
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
      {assignee?.displayName && (
        <span className="ml-1 shrink-0">
          <Avatar identity={assignee} size="xs" />
        </span>
      )}
    </BannerShell>
  );
}

export function UnparentedBanner({
  totalTasks,
  collapsed,
  onToggle,
}: {
  totalTasks: number;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <BannerShell collapsed={collapsed} onToggle={onToggle}>
      <span className="text-zinc-300 font-medium">Everything else</span>
      <span className="text-[11px] text-zinc-600 shrink-0">
        · {totalTasks} {totalTasks === 1 ? 'task' : 'tasks'} with no parent in this sprint
      </span>
    </BannerShell>
  );
}
