import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { Clock, Loader2 } from 'lucide-react';
import { useQueries } from '@tanstack/react-query';
import type { TaskboardData } from '@/ado/hooks/useTaskboard';
import type { AdoIdentity, AdoWorkItem } from '@/ado/types';
import { listWorkItemUpdates } from '@/ado/endpoints';
import { useSettings } from '@/state/settings.store';
import { useTheme } from '@/state/theme.store';
import { cn } from '@/lib/cn';
import { Avatar } from './Avatar';
import { contributorBarColor } from './workItemVisuals';
import { formatHours, formatHoursHuman } from './timeFormat';

const POPOVER_WIDTH = 340;
const POPOVER_MAX_HEIGHT = 480;

interface Contributor {
  key: string;
  identity: AdoIdentity | undefined;
  total: number;
  pct: number;
  color: string;
}

function identityKey(i: AdoIdentity | undefined): string {
  if (!i) return '__unknown__';
  return i.uniqueName ?? i.id ?? i.displayName;
}

function numOrZero(v: unknown): number {
  const n = typeof v === 'number' ? v : v == null ? 0 : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round(n: number): number {
  return Number(n.toFixed(4));
}

/** Overall sprint time tracking summary.
 *
 *  The button label is a fast total: sum of every card's current
 *  `CompletedWork`, read straight from the already-loaded board. No network.
 *
 *  The popover breakdown is the accurate one: on first open we fan out
 *  /updates per card with `CompletedWork > 0`, net signed deltas per
 *  `revisedBy`, and aggregate across the whole sprint. Same accounting the
 *  modal's Work Log "By person" card uses. Queries share the
 *  ['workitem-updates', projectId, id] key with the modal, so opening a card
 *  first warms this view for free; and once fetched they stay fresh for 60s. */
export function OverallTracking({ board }: { board: TaskboardData | undefined }) {
  const projectId = useSettings((s) => s.projectId);
  const theme = useTheme((s) => s.theme);
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  // Fast total from current CompletedWork values; always available, no fetch.
  const totalHoursFast = useMemo(() => {
    if (!board) return 0;
    let sum = 0;
    const add = (wi: AdoWorkItem) => {
      const h = numOrZero(wi.fields['Microsoft.VSTS.Scheduling.CompletedWork']);
      if (h > 0) sum = round(sum + h);
    };
    for (const lane of board.swimlanes) {
      add(lane.row);
      for (const t of lane.tasks) add(t.workItem);
    }
    for (const t of board.unparented) add(t.workItem);
    return sum;
  }, [board]);

  // IDs worth fetching /updates for — cards with positive current CompletedWork.
  // Items with 0 current hours and no log history wouldn't contribute; items
  // that netted to zero through corrections also contribute nothing either way.
  const trackedIds = useMemo(() => {
    if (!board) return [] as number[];
    const ids: number[] = [];
    const consider = (wi: AdoWorkItem) => {
      const h = numOrZero(wi.fields['Microsoft.VSTS.Scheduling.CompletedWork']);
      if (h > 0) ids.push(wi.id);
    };
    for (const lane of board.swimlanes) {
      consider(lane.row);
      for (const t of lane.tasks) consider(t.workItem);
    }
    for (const t of board.unparented) consider(t.workItem);
    return ids;
  }, [board]);

  const results = useQueries({
    queries: trackedIds.map((id) => ({
      queryKey: ['workitem-updates', projectId, id],
      queryFn: () => listWorkItemUpdates(projectId!, id),
      enabled: open && !!projectId,
      staleTime: 60_000,
      retry: false,
    })),
  });

  const allSettled = results.every((r) => !r.isPending && !r.isLoading);
  const anyError = results.some((r) => r.isError);
  const loadedCount = results.filter((r) => r.data != null).length;
  const isLoading = open && !allSettled;

  // Same accounting as WorkLogPanel: sum signed deltas per revisedBy. Filter
  // out contributors whose net is ≤ 0 so negative-only actors don't render.
  const { contributors, totalFromUpdates } = useMemo(() => {
    const byKey = new Map<
      string,
      { identity: AdoIdentity | undefined; total: number }
    >();
    let grand = 0;
    for (const r of results) {
      if (!r.data) continue;
      for (const upd of r.data) {
        const ch = upd.fields?.['Microsoft.VSTS.Scheduling.CompletedWork'];
        if (!ch) continue;
        const delta = round(numOrZero(ch.newValue) - numOrZero(ch.oldValue));
        if (delta === 0) continue;
        grand = round(grand + delta);
        const k = identityKey(upd.revisedBy);
        const cur = byKey.get(k) ?? { identity: upd.revisedBy, total: 0 };
        cur.total = round(cur.total + delta);
        byKey.set(k, cur);
      }
    }
    const list: Contributor[] = [...byKey.entries()]
      .filter(([, v]) => v.total > 0)
      .map(([key, v]) => ({
        key,
        identity: v.identity,
        total: v.total,
        pct: grand > 0 ? (v.total / grand) * 100 : 0,
        color: contributorBarColor(v.identity?.displayName ?? 'Unknown', theme),
      }))
      .sort((a, b) => b.total - a.total);
    return { contributors: list, totalFromUpdates: grand };
    // Depending on the mutable `results` array directly: TanStack returns
    // stable data references, so even though the outer array is recreated
    // per render, the iteration yields the same values until a query settles.
    // The memo recomputes on each render but the work is O(updates) and cheap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results.map((r) => r.dataUpdatedAt).join(','), theme]);

  function toggle() {
    if (!open && btnRef.current) {
      setRect(btnRef.current.getBoundingClientRect());
    }
    setOpen((o) => !o);
  }

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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const placement = rect
    ? (() => {
        const spaceBelow = window.innerHeight - rect.bottom;
        const flipUp = spaceBelow < POPOVER_MAX_HEIGHT && rect.top > spaceBelow;
        const top = flipUp ? Math.max(8, rect.top - POPOVER_MAX_HEIGHT - 4) : rect.bottom + 4;
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
          style: { position: 'fixed', top, left, width: POPOVER_WIDTH } as CSSProperties,
          origin,
        };
      })()
    : null;

  const hasAny = totalHoursFast > 0;
  // Prefer the updates-reconstructed total in the header once everything is
  // loaded — it should equal the fast total but is authoritative for the
  // accounting shown below. Fall back to the fast total otherwise.
  const headerTotal = allSettled && trackedIds.length > 0 ? totalFromUpdates : totalHoursFast;

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        disabled={!board}
        title={
          hasAny
            ? `${formatHoursHuman(totalHoursFast)} logged this sprint`
            : 'No time logged this sprint'
        }
        className={cn(
          'inline-flex items-center gap-1.5 h-7 px-2 rounded-md',
          'text-[12px] transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60',
          'disabled:opacity-40 disabled:cursor-not-allowed',
          open
            ? 'bg-[var(--color-overlay-1)] text-[var(--color-ink)]'
            : 'text-[var(--color-ink-muted)] hover:bg-[var(--color-overlay-soft)] hover:text-[var(--color-ink)]',
        )}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Clock className="h-3.5 w-3.5 shrink-0" />
      </button>
      {open &&
        placement &&
        createPortal(
          <div
            ref={popRef}
            style={{ ...placement.style, zIndex: 60 }}
            className={cn(
              'rounded-md overflow-hidden jfd-glass-panel jfd-popover-enter',
              placement.origin,
            )}
          >
            <div className="px-3 py-2.5 border-b border-[var(--color-hairline)] flex items-baseline justify-between gap-2">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
                  Sprint time
                </div>
                <div className="mono text-[13px] text-[var(--color-ink)] leading-tight mt-0.5">
                  {formatHoursHuman(headerTotal)}
                </div>
              </div>
              <div className="text-[10.5px] text-[var(--color-ink-dim)]">
                {isLoading
                  ? `${loadedCount}/${trackedIds.length}…`
                  : `${contributors.length} ${contributors.length === 1 ? 'contributor' : 'contributors'}`}
              </div>
            </div>

            {!hasAny ? (
              <EmptyState text="No time logged this sprint yet." />
            ) : isLoading && contributors.length === 0 ? (
              <div className="flex items-center gap-1.5 px-3 py-5 text-[12px] text-[var(--color-ink-muted)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading contributions…
              </div>
            ) : (
              <>
                {totalFromUpdates > 0 && (
                  <div className="px-3 pt-3">
                    <div
                      className="flex h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-overlay-1)]"
                      role="img"
                      aria-label={`Time split across ${contributors.length} contributors`}
                    >
                      {contributors.map((c) => (
                        <div
                          key={c.key}
                          title={tooltipFor(c)}
                          className="h-full"
                          style={{ width: `${c.pct}%`, backgroundColor: c.color }}
                        />
                      ))}
                    </div>
                  </div>
                )}
                <ul className="max-h-80 overflow-auto py-1.5">
                  {contributors.map((c) => {
                    const name = c.identity?.displayName ?? 'Unknown';
                    const pctLabel = c.pct < 1 ? '<1%' : `${Math.round(c.pct)}%`;
                    return (
                      <li
                        key={c.key}
                        className="flex items-center gap-2 px-3 py-1.5 text-[12.5px]"
                      >
                        <Avatar identity={c.identity} size="sm" />
                        <span className="truncate flex-1 text-[var(--color-ink)]">{name}</span>
                        <span className="mono text-[var(--color-ink)] shrink-0">
                          {formatHours(c.total)}
                        </span>
                        <span className="mono text-[11px] text-[var(--color-ink-dim)] shrink-0 w-10 text-right">
                          {pctLabel}
                        </span>
                      </li>
                    );
                  })}
                  {contributors.length === 0 && allSettled && !anyError && (
                    <li className="px-3 py-4 text-[12px] text-[var(--color-ink-dim)] text-center">
                      No positive contributions recorded.
                    </li>
                  )}
                </ul>
                {anyError && (
                  <div className="px-3 py-2 text-[11px] text-red-300/80 border-t border-[var(--color-hairline)]">
                    Some work-item histories couldn't be loaded.
                  </div>
                )}
              </>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="px-3 py-6 text-[12px] text-[var(--color-ink-dim)] flex items-center gap-2">
      <Clock className="h-3.5 w-3.5" /> {text}
    </div>
  );
}

function tooltipFor(c: Contributor): string {
  const name = c.identity?.displayName ?? 'Unknown';
  const pct = c.pct < 1 ? '<1' : String(Math.round(c.pct));
  return `${name} — ${formatHours(c.total)} (${pct}%)`;
}
