import {
  useEffect,
  useLayoutEffect,
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
  const pillBarRef = useRef<HTMLDivElement>(null);
  const projectName = useSettings((s) => s.projectName);

  // Deferred unmount so the exit animation has time to play. `visible` stays
  // true through the exit; `exiting=true` swaps the enter keyframe for the
  // exit keyframe. Timeout matches `.jfd-search-out` (100ms) so we unmount
  // right after it finishes.
  const [visible, setVisible] = useState(open);
  const [exiting, setExiting] = useState(false);
  useEffect(() => {
    if (open) {
      setVisible(true);
      setExiting(false);
    } else if (visible) {
      setExiting(true);
      const t = setTimeout(() => {
        setVisible(false);
        setExiting(false);
      }, 110);
      return () => clearTimeout(t);
    }
  }, [open, visible]);

  const { results, isLoading, isTyping, isShort, error, query: debounced } =
    useWorkItemSearch(query, scope, { iterationPath }, open);

  const visibleScopes = useMemo<readonly SearchScope[]>(() => {
    if (hasCurrentSprint) return SEARCH_SCOPES;
    return SEARCH_SCOPES.filter((s) => s !== 'sprint');
  }, [hasCurrentSprint]);

  // Refs to each scope-pill button + a slider indicator. The indicator is a
  // single absolute-positioned element that tweens left/width between pills
  // as the active scope changes — cleaner than re-coloring each pill on every
  // click. On first measurement it snaps into place (no from-state to animate
  // against), subsequent scope changes animate via the inline style transition.
  const pillRefs = useRef<Partial<Record<SearchScope, HTMLButtonElement | null>>>({});
  const [pillIndicator, setPillIndicator] = useState<
    { left: number; top: number; width: number; height: number } | null
  >(null);
  useLayoutEffect(() => {
    if (!visible) return;
    const active = pillRefs.current[scope];
    const bar = pillBarRef.current;
    if (!active || !bar) return;
    const br = bar.getBoundingClientRect();
    const pr = active.getBoundingClientRect();
    setPillIndicator({
      left: pr.left - br.left,
      top: pr.top - br.top,
      width: pr.width,
      height: pr.height,
    });
  }, [scope, visibleScopes, visible]);

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

  if (!visible) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]"
      // The backdrop owns the "click anywhere outside to dismiss" behaviour.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={handleKey}
    >
      {/* Dim the board just enough to keep attention on the panel, but NOT
          blurred — the user explicitly wanted the board to stay crisp and
          the atmospheric effect to live in the panel + light casts. Fades
          in/out in lockstep with the panel morph. pointer-events-none so
          mousedowns fall through to the wrapper above and trigger the
          outside-click dismiss. */}
      <div
        aria-hidden
        className={cn(
          'absolute inset-0 bg-black/35 pointer-events-none',
          exiting ? 'jfd-backdrop-out' : 'jfd-backdrop-in',
        )}
      />

      {/* Soft indigo/violet light casts behind the panel. Two radial gradients
          blurred heavily so they read as ambient light bleeding through the
          glass rather than distinct shapes. Clipped to the viewport so they
          never add a horizontal scrollbar. pointer-events-none so they don't
          eat clicks that should dismiss the overlay. */}
      <div
        aria-hidden
        className={cn(
          'absolute inset-0 overflow-hidden pointer-events-none',
          exiting ? 'jfd-backdrop-out' : 'jfd-backdrop-in',
        )}
      >
        <div
          className="absolute left-1/2 top-[5vh] -translate-x-1/2 h-[360px] w-[780px] rounded-full blur-3xl"
          style={{
            background:
              'radial-gradient(ellipse at center, rgb(129 140 248 / 0.28), transparent 65%)',
          }}
        />
        <div
          className="absolute left-1/2 top-[42vh] -translate-x-[68%] h-[320px] w-[600px] rounded-full blur-3xl"
          style={{
            background:
              'radial-gradient(ellipse at center, rgb(167 139 250 / 0.22), transparent 65%)',
          }}
        />
        <div
          className="absolute left-1/2 top-[55vh] -translate-x-[34%] h-[280px] w-[520px] rounded-full blur-3xl"
          style={{
            background:
              'radial-gradient(ellipse at center, rgb(56 189 248 / 0.14), transparent 65%)',
          }}
        />
      </div>

      {/* The panel itself — this is where the backdrop blur lives now, so the
          panel reads as translucent glass sitting over the ambient light and
          the (crisp) board behind. Subtle fade + small lift on enter/exit —
          matches the motion vocabulary used by the work-item modal. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search work items"
        className={cn(
          'relative w-full max-w-[640px] overflow-hidden rounded-2xl',
          'bg-[var(--color-surface-2)]/60 backdrop-blur-2xl',
          'border border-[var(--color-hairline-strong)] lit-top',
          // Ambient indigo glow outside the panel + deep drop shadow below.
          'shadow-[0_28px_80px_-16px_rgb(0_0_0/0.7),0_0_0_1px_rgb(129_140_248/0.06),0_0_60px_-10px_rgb(129_140_248/0.18)]',
          'flex flex-col',
          exiting ? 'jfd-search-out' : 'jfd-search-in',
        )}
        style={{ maxHeight: 'calc(100vh - 18vh)' }}
      >
        {/* Input row */}
        <div className="flex items-center gap-2 px-3.5 pt-3.5 pb-2.5">
          <Search className="h-4 w-4 text-[var(--color-ink-muted)] shrink-0" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIdx(0);
            }}
            placeholder="Search title, description, tags… or paste #id"
            aria-label="Search query"
            className={cn(
              'flex-1 bg-transparent border-0 outline-none',
              'text-[15px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-dim)]',
              'py-1',
            )}
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className={cn(
              'inline-flex h-6 w-6 items-center justify-center rounded',
              'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-overlay-1)]',
              'transition-colors duration-100',
            )}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Scope pills — a single sliding indicator tweens behind the active
            pill as the scope changes. Each pill is transparent-on-transparent
            at rest; the indicator provides the active indigo fill. */}
        <div
          ref={pillBarRef}
          className="relative flex items-center gap-1 px-3.5 pb-2.5 border-b border-[var(--color-hairline)]"
        >
          {pillIndicator && (
            <div
              aria-hidden
              className={cn(
                'absolute pointer-events-none rounded-full',
                'bg-indigo-400/[0.14] border border-indigo-400/30 lit-top',
                'transition-[left,top,width,height] duration-[200ms] ease-out',
              )}
              style={pillIndicator}
            />
          )}
          {visibleScopes.map((s) => {
            const active = s === scope;
            return (
              <button
                key={s}
                ref={(el) => {
                  pillRefs.current[s] = el;
                }}
                type="button"
                onClick={() => {
                  setScope(s);
                  setActiveIdx(0);
                  inputRef.current?.focus();
                }}
                aria-pressed={active}
                className={cn(
                  'relative z-[1] h-6 px-2.5 rounded-full text-[11px] font-medium',
                  'border border-transparent',
                  'transition-colors duration-150',
                  active
                    ? 'text-indigo-100'
                    : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-overlay-soft)]',
                )}
              >
                {SCOPE_LABELS[s].pill}
              </button>
            );
          })}
          <div className="ml-auto mono text-[10px] text-[var(--color-ink-dim)] hidden sm:block">
            ↑↓ · Enter · Esc
          </div>
        </div>

        {/* Results / state */}
        <div className="min-h-[200px] max-h-[56vh] overflow-y-auto">
          {renderBody()}
        </div>

        <SearchFooter />
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
        <div className="flex items-center justify-center gap-2 py-10 text-[12.5px] text-[var(--color-ink-muted)]">
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
      <div className="text-[12.5px] text-[var(--color-ink-muted)]">{title}</div>
      {subtitle && <div className="text-[11.5px] text-[var(--color-ink-dim)]">{subtitle}</div>}
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

  return (
    <li role="option" aria-selected={active}>
      <button
        type="button"
        data-idx={idx}
        onMouseEnter={onHover}
        onClick={onPick}
        className={cn(
          'w-full text-left px-3.5 py-2 flex items-start gap-3',
          'transition-colors duration-75',
          active ? 'bg-[var(--color-overlay-1)]' : 'hover:bg-[var(--color-overlay-soft)]',
        )}
      >
        <span
          className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0"
          style={{ backgroundColor: type.dot }}
          aria-hidden
        />
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-ink-muted)]">
            <span className="shrink-0 text-[var(--color-ink-muted)]">{type.label}</span>
            <span className="text-[var(--color-ink-dim)]">·</span>
            <span className="mono text-[var(--color-ink-muted)] shrink-0">#{workItem.id}</span>
            {showProject && teamProject && (
              <>
                <span className="text-[var(--color-ink-dim)]">·</span>
                <span className="truncate text-[var(--color-ink-muted)]">{teamProject}</span>
              </>
            )}
          </div>
          <div
            className={cn(
              'text-[13px] leading-snug line-clamp-2 break-words text-[var(--color-ink)]',
              active && 'font-medium',
            )}
          >
            {f['System.Title'] || '(untitled)'}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 pt-0.5">
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

/** Panel footer — small brand line + copyright + love-from-Altack. Kept
 *  calm: single row, hairline separator on top, muted text, and the
 *  gradient is reserved for the "Giraffied" wordmark only (project rule —
 *  gradients live exclusively on the brand mark). */
function SearchFooter() {
  const year = new Date().getFullYear();
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2',
        'px-3.5 py-2',
        'border-t border-[var(--color-hairline)]',
        'bg-[var(--color-overlay-soft)]',
      )}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <span aria-hidden className="text-[12px] leading-none">🦒</span>
        <span className="jfd-wordmark text-[11.5px] font-semibold tracking-tight">
          Giraffied
        </span>
        <span className="text-[var(--color-ink-dim)] select-none">·</span>
        <span className="mono text-[10.5px] text-[var(--color-ink-dim)]">© {year}</span>
      </div>
    </div>
  );
}
