import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Search, X } from 'lucide-react';
import type { AdoWorkItem } from '@/ado/types';
import {
  useWorkItemSearch,
  SEARCH_SCOPES,
  type SearchScope,
} from '@/ado/hooks/useWorkItemSearch';
import { AdoError } from '@/ado/client';
import { useSettings } from '@/state/settings.store';
import { cn } from '@/lib/cn';
import { Avatar } from '../Avatar';
import {
  stateChipTone,
  workItemTypeStyle,
} from '../workItemVisuals';

/** Short label for each scope's pill tab, and the hint text that appears in
 *  the empty-state copy ("searching across <scopeLabel>"). */
const SCOPE_LABELS: Record<SearchScope, { pill: string; hint: string }> = {
  sprint: { pill: 'Sprint', hint: 'this sprint' },
  team: { pill: 'Team', hint: "this team's area" },
  project: { pill: 'Project', hint: 'this project' },
  org: { pill: 'Org', hint: 'the whole organization' },
};

interface SearchOverlayProps {
  open: boolean;
  onClose: () => void;
  onSelect: (workItem: AdoWorkItem) => void;
  iterationPath: string | undefined;
  /** If the sprint scope isn't available (no current iteration), we default
   *  to team and hide the sprint pill. */
  hasCurrentSprint: boolean;
}

export function SearchOverlay({
  open,
  onClose,
  onSelect,
  iterationPath,
  hasCurrentSprint,
}: SearchOverlayProps) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<SearchScope>(
    hasCurrentSprint ? 'sprint' : 'team',
  );
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const projectName = useSettings((s) => s.projectName);

  const { results, isLoading, isTyping, isShort, error, query: debounced } =
    useWorkItemSearch(query, scope, { iterationPath }, open);

  const visibleScopes = useMemo<readonly SearchScope[]>(() => {
    if (hasCurrentSprint) return SEARCH_SCOPES;
    return SEARCH_SCOPES.filter((s) => s !== 'sprint');
  }, [hasCurrentSprint]);

  // Reset transient state each time the overlay opens — otherwise a stale
  // query/results flash from the previous open.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIdx(0);
    setScope(hasCurrentSprint ? 'sprint' : 'team');
    // Next tick — input renders inside a portal, autoFocus prop isn't always
    // honored when the element is mounted the same frame as the portal host.
    queueMicrotask(() => inputRef.current?.focus());
  }, [open, hasCurrentSprint]);

  // Keep activeIdx in-range as results change (e.g. typing shrinks the list).
  useEffect(() => {
    if (activeIdx >= results.length) {
      setActiveIdx(results.length === 0 ? 0 : results.length - 1);
    }
  }, [results.length, activeIdx]);

  // Scroll the active row into view on arrow-key navigation. `nearest` keeps
  // the list calm — we don't re-center on every keystroke.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-idx="${activeIdx}"]`,
    );
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx, open]);

  function handleKey(e: ReactKeyboardEvent<HTMLElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(results.length - 1, i + 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === 'Enter') {
      const pick = results[activeIdx];
      if (pick) {
        e.preventDefault();
        onSelect(pick);
      }
      return;
    }
  }

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]"
      // The backdrop owns the "click anywhere outside to dismiss" behaviour.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={handleKey}
    >
      <div
        aria-hidden
        className="absolute inset-0 bg-[var(--color-canvas)]/55 backdrop-blur-xl"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search work items"
        className={cn(
          'relative w-full max-w-[640px] overflow-hidden rounded-xl',
          'bg-[var(--color-surface-2)]/85 backdrop-blur-2xl',
          'border border-white/[0.08] lit-top',
          'shadow-[0_24px_64px_-12px_rgb(0_0_0/0.65)]',
          'flex flex-col',
          'jfd-popover-enter',
        )}
        style={{ maxHeight: 'calc(100vh - 20vh)' }}
      >
        {/* Input row */}
        <div className="flex items-center gap-2 px-3 pt-3 pb-2">
          <Search className="h-4 w-4 text-zinc-500 shrink-0" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIdx(0);
            }}
            placeholder="Search title, description, tags, repro steps… or paste #id"
            aria-label="Search query"
            className={cn(
              'flex-1 bg-transparent border-0 outline-none',
              'text-[15px] text-zinc-50 placeholder:text-zinc-600',
              'py-1',
            )}
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className={cn(
              'inline-flex h-6 w-6 items-center justify-center rounded',
              'text-zinc-500 hover:text-zinc-100 hover:bg-white/[0.06]',
              'transition-colors duration-100',
            )}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Scope pills */}
        <div className="flex items-center gap-1 px-3 pb-2 border-b border-white/[0.06]">
          {visibleScopes.map((s) => {
            const active = s === scope;
            return (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setScope(s);
                  setActiveIdx(0);
                  inputRef.current?.focus();
                }}
                aria-pressed={active}
                className={cn(
                  'h-6 px-2.5 rounded-full text-[11px] font-medium',
                  'transition-colors duration-100',
                  active
                    ? 'bg-indigo-400/[0.14] border border-indigo-400/30 text-indigo-100 lit-top'
                    : 'bg-white/[0.02] border border-white/[0.06] text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.05]',
                )}
              >
                {SCOPE_LABELS[s].pill}
              </button>
            );
          })}
          <div className="ml-auto mono text-[10px] text-zinc-600 hidden sm:block">
            ↑↓ to navigate · Enter to open · Esc to close
          </div>
        </div>

        {/* Results / state */}
        <div className="min-h-[200px] max-h-[60vh] overflow-y-auto">
          {renderBody()}
        </div>
      </div>
    </div>,
    document.body,
  );

  function renderBody() {
    if (error) {
      const detail =
        error instanceof AdoError
          ? `${error.status} ${error.statusText} — ${error.body.slice(0, 200)}`
          : error instanceof Error
            ? error.message
            : String(error);
      return (
        <div className="p-6 text-[12.5px] text-red-300/90 space-y-1">
          <div className="font-medium">Search failed</div>
          <div className="mono text-[11px] text-red-300/70 whitespace-pre-wrap break-words">
            {detail}
          </div>
        </div>
      );
    }

    if (query.trim().length === 0) {
      return (
        <EmptyHint
          title={`Start typing to search across ${SCOPE_LABELS[scope].hint}`}
          subtitle={
            scope === 'org'
              ? 'Org-wide results may span projects you have access to.'
              : `Searching in ${projectName ?? 'this project'}.`
          }
        />
      );
    }

    if (isShort) {
      return <EmptyHint title="Keep typing — minimum 2 characters." />;
    }

    if (isLoading || isTyping) {
      return (
        <div className="flex items-center justify-center gap-2 py-10 text-[12.5px] text-zinc-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Searching…
        </div>
      );
    }

    if (results.length === 0) {
      return (
        <EmptyHint
          title={`No matches for “${debounced}”`}
          subtitle={`Try widening the scope — currently ${SCOPE_LABELS[scope].hint}.`}
        />
      );
    }

    return (
      <ul ref={listRef} role="listbox" className="py-1">
        {results.map((w, i) => (
          <ResultRow
            key={w.id}
            workItem={w}
            idx={i}
            active={i === activeIdx}
            showProject={scope === 'org'}
            onHover={() => setActiveIdx(i)}
            onPick={() => onSelect(w)}
          />
        ))}
      </ul>
    );
  }
}

function EmptyHint({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="p-8 text-center space-y-1">
      <div className="text-[12.5px] text-zinc-400">{title}</div>
      {subtitle && <div className="text-[11.5px] text-zinc-600">{subtitle}</div>}
    </div>
  );
}

function ResultRow({
  workItem,
  idx,
  active,
  showProject,
  onHover,
  onPick,
}: {
  workItem: AdoWorkItem;
  idx: number;
  active: boolean;
  showProject: boolean;
  onHover: () => void;
  onPick: () => void;
}) {
  const f = workItem.fields;
  const type = workItemTypeStyle(f['System.WorkItemType']);
  const state = f['System.State'] ?? '';
  const assignee = f['System.AssignedTo'];
  const teamProject = (f['System.TeamProject'] as string | undefined) ?? '';
  // Compact iteration path: drop the project prefix so "Foo\\Sprint 42"
  // becomes "Sprint 42" — the project appears elsewhere when relevant.
  const iteration = (f['System.IterationPath'] as string | undefined) ?? '';
  const compactIteration = iteration.includes('\\')
    ? iteration.slice(iteration.indexOf('\\') + 1)
    : iteration;

  return (
    <li role="option" aria-selected={active}>
      <button
        type="button"
        data-idx={idx}
        onMouseEnter={onHover}
        onClick={onPick}
        className={cn(
          'w-full text-left px-3 py-2 flex items-start gap-3',
          'transition-colors duration-75',
          active ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]',
        )}
      >
        <span
          className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0"
          style={{ backgroundColor: type.dot }}
          aria-hidden
        />
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
            <span className="shrink-0 text-zinc-400">{type.label}</span>
            <span className="text-zinc-700">·</span>
            <span className="mono text-zinc-500 shrink-0">#{workItem.id}</span>
            {showProject && teamProject && (
              <>
                <span className="text-zinc-700">·</span>
                <span className="truncate text-zinc-500">{teamProject}</span>
              </>
            )}
          </div>
          <div
            className={cn(
              'text-[13px] truncate',
              active ? 'text-zinc-50' : 'text-zinc-100',
            )}
          >
            {f['System.Title'] || '(untitled)'}
          </div>
          {compactIteration && (
            <div className="mono text-[10.5px] text-zinc-600 truncate">
              {compactIteration}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={cn(
              'hidden sm:inline-flex h-5 items-center px-1.5 rounded text-[10.5px] font-medium',
              'border',
              stateChipTone(state),
            )}
          >
            {state || '—'}
          </span>
          <Avatar identity={assignee} size="sm" />
        </div>
      </button>
    </li>
  );
}
