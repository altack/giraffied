import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Loader2, UserX } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useTeamMembers } from '@/ado/hooks/useTeamMembers';
import type { AdoIdentity } from '@/ado/types';
import { cn } from '@/lib/cn';
import { Avatar } from './Avatar';

const POPOVER_WIDTH = 288;
const POPOVER_MAX_HEIGHT = 320;

const identityKey = (i: AdoIdentity) => i.uniqueName ?? i.id ?? i.displayName;

/** Reusable trigger-button + portal'd popover for picking an identity.
 *  Default list is `boardAssignees`; typing widens to the full team roster
 *  (fetched lazily via `useTeamMembers`). Portaled to `document.body` so it
 *  escapes overflow-clipped ancestors (modal sidebars, etc.). */
export function AssigneePicker({
  value,
  onChange,
  boardAssignees,
  buttonClassName,
}: {
  value: AdoIdentity | null;
  onChange: (a: AdoIdentity | null) => void;
  boardAssignees: AdoIdentity[];
  buttonClassName?: string;
}) {
  const { data: members, isLoading: membersLoading, isError } = useTeamMembers();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      if (btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // Capture-phase Escape so the popover closes without bubbling to the modal's
  // window-level Escape handler (which would close the whole dialog).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.stopImmediatePropagation();
      e.preventDefault();
      setOpen(false);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open]);

  const { results, searching } = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return { results: boardAssignees, searching: false };
    const pool = new Map<string, AdoIdentity>();
    for (const a of boardAssignees) pool.set(identityKey(a), a);
    for (const m of members ?? []) pool.set(identityKey(m.identity), m.identity);
    const matches: AdoIdentity[] = [];
    for (const id of pool.values()) {
      const hay =
        (id.displayName ?? '').toLowerCase() + ' ' + (id.uniqueName ?? '').toLowerCase();
      if (hay.includes(q)) matches.push(id);
    }
    matches.sort((a, b) =>
      a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }),
    );
    return { results: matches.slice(0, 100), searching: true };
  }, [filter, boardAssignees, members]);

  const pick = useCallback(
    (id: AdoIdentity | null) => {
      onChange(id);
      setOpen(false);
      setFilter('');
    },
    [onChange],
  );

  function toggle() {
    if (!open && btnRef.current) {
      setRect(btnRef.current.getBoundingClientRect());
    }
    setOpen((o) => !o);
  }

  const popoverStyle: React.CSSProperties | null = rect
    ? (() => {
        const spaceBelow = window.innerHeight - rect.bottom;
        const flipUp = spaceBelow < POPOVER_MAX_HEIGHT && rect.top > spaceBelow;
        const top = flipUp
          ? Math.max(8, rect.top - POPOVER_MAX_HEIGHT - 4)
          : rect.bottom + 4;
        const rightAligned = rect.right - POPOVER_WIDTH;
        const left = Math.max(8, Math.min(rightAligned, window.innerWidth - POPOVER_WIDTH - 8));
        return { position: 'fixed', top, left, width: POPOVER_WIDTH };
      })()
    : null;

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className={cn(
          'w-full h-8 flex items-center gap-2 rounded-md px-2.5 text-[13px] text-left',
          'bg-white/[0.03] border border-white/[0.08] text-zinc-100',
          'hover:bg-white/[0.05]',
          'focus-visible:outline-none focus-visible:border-indigo-400/40 focus-visible:ring-2 focus-visible:ring-indigo-400/15',
          'transition-colors duration-150',
          buttonClassName,
        )}
      >
        <Avatar identity={value ?? undefined} size="sm" />
        <span className="truncate flex-1">{value?.displayName ?? 'Unassigned'}</span>
        <ChevronDown className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
      </button>
      {open &&
        popoverStyle &&
        createPortal(
          <div
            ref={popRef}
            data-no-drag
            style={{ ...popoverStyle, zIndex: 60 }}
            className="rounded-md border border-white/[0.08] bg-[var(--color-surface-2)]/95 backdrop-blur-xl shadow-2xl shadow-black/50 overflow-hidden"
          >
            <div className="p-1.5 border-b border-white/[0.06]">
              <Input
                autoFocus
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search people…"
                className="h-7"
              />
            </div>
            <div className="max-h-64 overflow-auto py-1">
              <button
                type="button"
                onClick={() => pick(null)}
                className={cn(
                  'w-full flex items-center gap-2 px-2.5 py-1.5 text-[13px] text-zinc-400 hover:bg-white/[0.04]',
                  value === null && 'bg-white/[0.03] text-zinc-100',
                )}
              >
                <UserX className="h-4 w-4 text-zinc-500" />
                Unassigned
              </button>
              {isError && (
                <div className="px-2.5 py-2 text-[12px] text-red-300/80">
                  Couldn't load team members.
                </div>
              )}
              {results.map((id) => {
                const selected =
                  identityKey(id) === (value ? identityKey(value) : null);
                return (
                  <button
                    key={identityKey(id)}
                    type="button"
                    onClick={() => pick(id)}
                    className={cn(
                      'w-full flex items-center gap-2 px-2.5 py-1.5 text-[13px] text-zinc-200 hover:bg-white/[0.04]',
                      selected && 'bg-white/[0.03]',
                    )}
                  >
                    <Avatar identity={id} size="sm" />
                    <span className="truncate flex-1 text-left">{id.displayName}</span>
                    {id.uniqueName && (
                      <span className="text-[11px] text-zinc-600 truncate mono max-w-[140px]">
                        {id.uniqueName}
                      </span>
                    )}
                  </button>
                );
              })}
              {results.length === 0 && !isError && (
                <div className="px-2.5 py-2 text-[12px] text-zinc-600 flex items-center gap-1.5">
                  {searching && membersLoading && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
                  {searching
                    ? membersLoading
                      ? 'Searching team…'
                      : 'No matches.'
                    : 'No one is on this board yet.'}
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
