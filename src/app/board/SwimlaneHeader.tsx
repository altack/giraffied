import { type MouseEvent, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import type { AdoWorkItem } from '@/ado/types';
import { cn } from '@/lib/cn';
import { parseTags, stateChipTone, workItemTypeStyle } from './workItemVisuals';
import { CopyLinkButton } from './CopyLinkButton';
import { CreateTaskButton } from './CreateTaskButton';
import { OpenLinkButton } from './OpenLinkButton';
import { Avatar } from './Avatar';
import { isSelectingTextIn } from './selection';

function BannerShell({
  collapsed,
  onToggle,
  isRecentlyFocused,
  children,
}: {
  collapsed: boolean;
  onToggle: () => void;
  isRecentlyFocused?: boolean;
  children: ReactNode;
}) {
  // Clicking anywhere on the banner background toggles collapse. Opening the
  // work item is reserved for the title button in SwimlaneBanner (which stops
  // propagation). Keyboard flow: tab to the chevron (toggle) → tab to the title
  // button (open modal) → tab to the copy-link button.
  // A text selection that spans out of the title (mousedown on title, mouseup
  // elsewhere in the banner) fires a click here rather than on the title — so
  // guard against the selection-as-click case before collapsing.
  const handleShellClick = (e: MouseEvent<HTMLDivElement>) => {
    if (isSelectingTextIn(e.currentTarget)) return;
    onToggle();
  };
  return (
    <div
      onClick={handleShellClick}
      className={cn(
        'group flex w-full items-center gap-2 py-1 text-[13.5px] text-left cursor-pointer',
        'rounded-md px-1 -mx-1 hover:bg-white/[0.03] transition-colors',
        isRecentlyFocused && 'jfd-focus-hint',
      )}
      // Subtle horizontal bleed of the inherited --lane-hue — feels like the
      // lane's color "emanates" from the banner and spills into the cells
      // below. Fades out by ~32% so the banner's title/tags read against a
      // near-neutral surface.
      style={{
        backgroundImage:
          'linear-gradient(90deg, rgb(var(--lane-hue) / 0.07), transparent 32%)',
      }}
    >
      <button
        type="button"
        aria-label={collapsed ? 'Expand' : 'Collapse'}
        aria-expanded={!collapsed}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className="inline-flex items-center justify-center rounded p-0.5 text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06] focus:outline-none focus-visible:ring-1 focus-visible:ring-indigo-400/40 transition-colors"
      >
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 shrink-0 transition-transform duration-150',
            collapsed && '-rotate-90',
          )}
        />
      </button>
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
  onOpen,
  onCreate,
  isRecentlyFocused,
}: {
  row: AdoWorkItem;
  totalTasks: number;
  points?: number;
  collapsed: boolean;
  onToggle: () => void;
  onOpen?: () => void;
  onCreate?: () => void;
  isRecentlyFocused?: boolean;
}) {
  const f = row.fields;
  const type = workItemTypeStyle(f['System.WorkItemType']);
  const tags = parseTags(f['System.Tags']);
  const assignee = f['System.AssignedTo'];
  const state = f['System.State'];

  return (
    <BannerShell collapsed={collapsed} onToggle={onToggle} isRecentlyFocused={isRecentlyFocused}>
      <span
        className="h-1.5 w-1.5 rounded-full shrink-0"
        style={{ backgroundColor: type.dot }}
        aria-hidden
      />
      <span className="text-zinc-400 shrink-0">{type.label}</span>
      <span className="mono text-[11px] text-zinc-600 shrink-0">#{row.id}</span>
      {state && (
        <span
          className={cn(
            'shrink-0 inline-flex items-center rounded-sm border px-1.5 py-0.5',
            'text-[10px] font-medium uppercase tracking-[0.06em] leading-none',
            stateChipTone(state),
          )}
        >
          {state}
        </span>
      )}
      {/* Span (not button) so the title text is user-selectable — buttons ship
       * with `user-select: none` in several UAs. A click that's actually a text
       * selection is passed through to the shell handler, which also ignores it. */}
      <span
        role={onOpen ? 'button' : undefined}
        tabIndex={onOpen ? 0 : undefined}
        onClick={
          onOpen
            ? (e) => {
                if (isSelectingTextIn(e.currentTarget)) return;
                e.stopPropagation();
                onOpen();
              }
            : undefined
        }
        onKeyDown={
          onOpen
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpen();
                }
              }
            : undefined
        }
        className={cn(
          'min-w-0 truncate text-left select-text',
          // Safe zone around the text so a click that lands a few px off the
          // glyphs still initiates a text selection instead of bubbling to the
          // banner toggle. Negative margin cancels the padding in flex layout.
          'px-1 -mx-1',
          'text-zinc-100 font-medium',
          onOpen && 'cursor-pointer hover:underline underline-offset-2 decoration-white/30',
          'focus:outline-none focus-visible:underline focus-visible:decoration-white/40',
        )}
      >
        {f['System.Title']}
      </span>
      {/* key={totalTasks} remounts the span on count change so the brief
          slide-up keyframe fires — subtle motion that signals "this changed
          because a card moved". */}
      <span
        key={totalTasks}
        className="mono text-[11px] text-zinc-600 shrink-0 jfd-count-roll inline-block"
      >
        · {totalTasks} {totalTasks === 1 ? 'task' : 'tasks'}{' '}
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
        <span className="mono text-[11px] text-zinc-500 shrink-0">· {points}SP</span>
      )}
      {assignee?.displayName && (
        <span className="ml-1 shrink-0 flex">
          <Avatar identity={assignee} size="xs" />
        </span>
      )}
      <span className="ml-0.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-100 shrink-0">
        <CopyLinkButton workItemId={row.id} />
        <OpenLinkButton workItemId={row.id} />
        {onCreate && (
          <CreateTaskButton onClick={onCreate} title={`Add task under ${f['System.Title']}`} />
        )}
      </span>
    </BannerShell>
  );
}

export function UnparentedBanner({
  totalTasks,
  collapsed,
  onToggle,
  onCreate,
  isRecentlyFocused,
}: {
  totalTasks: number;
  collapsed: boolean;
  onToggle: () => void;
  onCreate?: () => void;
  isRecentlyFocused?: boolean;
}) {
  return (
    <BannerShell collapsed={collapsed} onToggle={onToggle} isRecentlyFocused={isRecentlyFocused}>
      <span className="text-zinc-300 font-medium">Everything else</span>
      <span
        key={totalTasks}
        className="text-[11px] text-zinc-600 shrink-0 jfd-count-roll inline-block"
      >
        · {totalTasks} {totalTasks === 1 ? 'task' : 'tasks'} with no parent in this sprint
      </span>
      {onCreate && (
        <span className="ml-1 flex items-center shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-100">
          <CreateTaskButton onClick={onCreate} title="Add task with no parent" />
        </span>
      )}
    </BannerShell>
  );
}
