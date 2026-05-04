import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, Search, Users, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Avatar } from './Avatar';
import type { BoardAssignee } from './assigneesOnBoard';

const FACEPILE_MAX = 4;
const POPOVER_WIDTH = 260;
const POPOVER_MAX_HEIGHT = 400;

/** Top-right filter for "show only cards assigned to this person".
 *
 *  Calm state: a small trigger button with a facepile of the top-N most-loaded
 *  assignees (and a "+N" counter when there are more). Clicking opens a
 *  portal'd popover with the full list, searchable, showing per-person card
 *  counts. Picking a row sets the filter and closes.
 *
 *  Active state: the trigger collapses into a single chip (`[avatar] Name ×`).
 *  Click the chip to re-open the picker; click × to clear. No layout shift
 *  inside the bar, no hover-lift gymnastics. */
export function AssigneeFilter({
  assignees,
  selectedKey,
  onSelect,
}: {
  assignees: BoardAssignee[];
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => assignees.find((e) => e.key === selectedKey) ?? null,
    [assignees, selectedKey],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return assignees;
    return assignees.filter((e) => {
      const d = e.identity.displayName.toLowerCase();
      const u = e.identity.uniqueName?.toLowerCase() ?? '';
      return d.includes(q) || u.includes(q);
    });
  }, [assignees, query]);

  function openPopover() {
    if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
    setQuery('');
    setActiveIdx(0);
    setOpen(true);
  }

  function closePopover() {
    setOpen(false);
  }

  function handlePick(key: string) {
    onSelect(selectedKey === key ? null : key);
    closePopover();
  }

  // Keep popover anchored through scroll/resize — same pattern as OverallTracking.
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      closePopover();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePopover();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Reset the active row when the query changes so highlight tracks visible results.
  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  function handleSearchKey(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      const pick = filtered[activeIdx];
      if (pick) {
        e.preventDefault();
        handlePick(pick.key);
      }
    }
  }

  if (assignees.length === 0) return null;

  const placement = rect
    ? (() => {
        const spaceBelow = window.innerHeight - rect.bottom;
        const flipUp = spaceBelow < POPOVER_MAX_HEIGHT && rect.top > spaceBelow;
        const top = flipUp
          ? Math.max(8, rect.top - POPOVER_MAX_HEIGHT - 6)
          : rect.bottom + 6;
        const rightAligned = rect.right - POPOVER_WIDTH;
        const left = Math.max(
          8,
          Math.min(rightAligned, window.innerWidth - POPOVER_WIDTH - 8),
        );
        const alignedRight = left + POPOVER_WIDTH >= rect.right - 4;
        const origin = flipUp
          ? alignedRight ? 'from-bottom-right' : 'from-bottom-left'
          : alignedRight ? 'from-top-right' : 'from-top-left';
        return {
          style: { position: 'fixed', top, left, width: POPOVER_WIDTH, zIndex: 60 } as CSSProperties,
          origin,
        };
      })()
    : null;

  return (
    <>
      {selected ? (
        <ActiveChip
          triggerRef={triggerRef}
          selected={selected}
          open={open}
          onOpen={openPopover}
          onClear={() => onSelect(null)}
        />
      ) : (
        <IdleTrigger
          triggerRef={triggerRef}
          assignees={assignees}
          open={open}
          onOpen={openPopover}
        />
      )}
      {open &&
        placement &&
        createPortal(
          <div
            ref={popRef}
            style={placement.style}
            className={cn(
              'rounded-lg overflow-hidden jfd-glass-panel jfd-popover-enter',
              placement.origin,
            )}
            role="dialog"
            aria-label="Filter by assignee"
          >
            <div className="p-2 border-b border-[var(--color-hairline)]">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--color-ink-muted)] pointer-events-none" />
                <input
                  ref={searchRef}
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleSearchKey}
                  placeholder="Filter by assignee…"
                  className={cn(
                    'w-full h-7 pl-7 pr-2 rounded-md text-[12.5px]',
                    'bg-[var(--color-overlay-soft)] border border-[var(--color-hairline)] text-[var(--color-ink)]',
                    'placeholder:text-[var(--color-ink-dim)]',
                    'focus:outline-none focus:border-indigo-400/40 focus:bg-[var(--color-overlay-1)]',
                    'transition-colors duration-100',
                  )}
                />
              </div>
            </div>
            <ul
              className="py-1 overflow-auto"
              style={{ maxHeight: POPOVER_MAX_HEIGHT - 52 }}
              role="listbox"
            >
              {filtered.map((e, i) => {
                const isSelected = e.key === selectedKey;
                const isActive = i === activeIdx;
                return (
                  <li key={e.key} role="option" aria-selected={isSelected}>
                    <button
                      type="button"
                      onClick={() => handlePick(e.key)}
                      onMouseEnter={() => setActiveIdx(i)}
                      className={cn(
                        'w-full flex items-center gap-2 px-2 py-1.5 text-left text-[12.5px]',
                        'transition-colors duration-100',
                        isActive && 'bg-[var(--color-overlay-1)]',
                        // 8% indigo wash disappears into a white canvas; bump
                        // the alpha for light theme so "selected" reads.
                        isSelected && 'bg-indigo-400/[0.08] theme-light:bg-indigo-500/[0.14]',
                      )}
                    >
                      <Avatar identity={e.identity} size="sm" />
                      <span className="flex-1 truncate text-[var(--color-ink)]">
                        {e.identity.displayName}
                      </span>
                      <span className="mono text-[10.5px] text-[var(--color-ink-muted)] shrink-0">
                        {e.count}
                      </span>
                      {isSelected ? (
                        <Check className="h-3 w-3 text-indigo-300 shrink-0" />
                      ) : (
                        <span className="w-3 shrink-0" aria-hidden />
                      )}
                    </button>
                  </li>
                );
              })}
              {filtered.length === 0 && (
                <li className="px-3 py-4 text-[12px] text-[var(--color-ink-dim)] text-center">
                  No matches
                </li>
              )}
            </ul>
          </div>,
          document.body,
        )}
    </>
  );
}

function IdleTrigger({
  triggerRef,
  assignees,
  open,
  onOpen,
}: {
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  assignees: BoardAssignee[];
  open: boolean;
  onOpen: () => void;
}) {
  const pile = assignees.slice(0, FACEPILE_MAX);
  const rest = Math.max(0, assignees.length - FACEPILE_MAX);

  return (
    <button
      ref={triggerRef}
      type="button"
      onClick={onOpen}
      title="Filter by assignee"
      aria-haspopup="dialog"
      aria-expanded={open}
      className={cn(
        'group inline-flex items-center gap-1.5 h-7 pl-1.5 pr-2 rounded-md',
        'border border-transparent transition-colors duration-150',
        'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]',
        open ? 'bg-[var(--color-overlay-1)] text-[var(--color-ink)]' : 'hover:bg-[var(--color-overlay-soft)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60',
      )}
    >
      <Users className="h-3.5 w-3.5 shrink-0 opacity-70 group-hover:opacity-100" aria-hidden />
      <span className="flex items-center" aria-hidden>
        {pile.map((e, i) => (
          <span
            key={e.key}
            className={cn('inline-flex', i > 0 && '-ml-1.5')}
            style={{ zIndex: FACEPILE_MAX - i }}
          >
            <span className="rounded-full ring-1 ring-[var(--color-canvas)]">
              <Avatar identity={e.identity} size="sm" />
            </span>
          </span>
        ))}
      </span>
      {rest > 0 && (
        <span className="mono text-[10.5px] text-[var(--color-ink-muted)] group-hover:text-[var(--color-ink)]">
          +{rest}
        </span>
      )}
    </button>
  );
}

function ActiveChip({
  triggerRef,
  selected,
  open,
  onOpen,
  onClear,
}: {
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  selected: BoardAssignee;
  open: boolean;
  onOpen: () => void;
  onClear: () => void;
}) {
  return (
    <div
      className={cn(
        'inline-flex items-center h-7 pl-1 pr-0.5 rounded-md',
        'bg-indigo-400/[0.10] border border-indigo-400/30 lit-top',
        // Dark-tuned indigo washes blend into a white canvas. Bump fill +
        // border so the chip reads as activated under [data-theme="light"].
        'theme-light:bg-indigo-500/[0.14] theme-light:border-indigo-500/45',
        'transition-colors duration-150',
      )}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={onOpen}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={`Filtering by ${selected.identity.displayName} — click to change`}
        className={cn(
          'inline-flex items-center gap-1.5 h-6 pl-0.5 pr-1.5 rounded-sm',
          // text-indigo-100 is near-white — invisible on the light chip fill.
          // theme-light flips to indigo-700 for clear contrast.
          'text-[12px] text-indigo-100 theme-light:text-indigo-800 font-medium',
          'hover:bg-[var(--color-overlay-soft)] transition-colors duration-100',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60',
        )}
      >
        <Avatar identity={selected.identity} size="sm" />
        <span className="max-w-[140px] truncate">{selected.identity.displayName}</span>
        <span className="mono text-[10.5px] text-indigo-300/70 theme-light:text-indigo-700/80">
          {selected.count}
        </span>
      </button>
      <button
        type="button"
        onClick={onClear}
        title="Clear filter"
        aria-label="Clear assignee filter"
        className={cn(
          'inline-flex items-center justify-center h-5 w-5 rounded',
          'text-indigo-200/70 hover:text-white hover:bg-[var(--color-overlay-1)]',
          'theme-light:text-indigo-700/70 theme-light:hover:text-indigo-900 theme-light:hover:bg-indigo-500/15',
          'transition-colors duration-100',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60',
        )}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
