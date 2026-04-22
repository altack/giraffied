import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Slash } from 'lucide-react';
import { Input } from '@/components/ui/input';
import type { Swimlane } from '@/ado/hooks/useTaskboard';
import { cn } from '@/lib/cn';
import { workItemTypeStyle } from './workItemVisuals';

const POPOVER_MAX_HEIGHT = 320;

/** Trigger button + portal'd popover for picking the parent of a new task.
 *  Unlike `AssigneePicker`, the popover's width matches the trigger (not a
 *  fixed pixel width) so it looks integrated with the form field it sits in.
 *  "No parent" is pinned on top of the results. */
export function ParentPicker({
  value,
  onChange,
  swimlanes,
}: {
  value: number | null;
  onChange: (id: number | null) => void;
  swimlanes: Swimlane[];
}) {
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

  const results = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return swimlanes;
    return swimlanes.filter((lane) => {
      const f = lane.row.fields;
      const hay = `${f['System.Title']} ${f['System.WorkItemType']} #${lane.row.id}`
        .toLowerCase();
      return hay.includes(q);
    });
  }, [filter, swimlanes]);

  const selected = useMemo(
    () => (value == null ? null : swimlanes.find((l) => l.row.id === value) ?? null),
    [value, swimlanes],
  );

  const pick = useCallback(
    (id: number | null) => {
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

  // Popover aligns to the trigger's left edge and matches its width so the
  // dropdown looks like a continuation of the input.
  const popoverStyle: React.CSSProperties | null = rect
    ? (() => {
        const spaceBelow = window.innerHeight - rect.bottom;
        const flipUp = spaceBelow < POPOVER_MAX_HEIGHT && rect.top > spaceBelow;
        const top = flipUp
          ? Math.max(8, rect.top - POPOVER_MAX_HEIGHT - 4)
          : rect.bottom + 4;
        return { position: 'fixed', top, left: rect.left, width: rect.width };
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
        )}
      >
        {selected ? (
          <ParentRowLabel lane={selected} />
        ) : (
          <span className="flex items-center gap-2 text-zinc-400 flex-1">
            <Slash className="h-3.5 w-3.5 text-zinc-600" />
            No parent (Everything else)
          </span>
        )}
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
                placeholder="Search parent…"
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
                <Slash className="h-3.5 w-3.5 text-zinc-600 shrink-0" />
                No parent (Everything else)
              </button>
              {results.map((lane) => {
                const isSelected = value === lane.row.id;
                return (
                  <button
                    key={lane.row.id}
                    type="button"
                    onClick={() => pick(lane.row.id)}
                    className={cn(
                      'w-full flex items-center gap-2 px-2.5 py-1.5 text-[13px] text-zinc-200 hover:bg-white/[0.04] text-left',
                      isSelected && 'bg-white/[0.03]',
                    )}
                  >
                    <ParentRowLabel lane={lane} />
                  </button>
                );
              })}
              {results.length === 0 && (
                <div className="px-2.5 py-2 text-[12px] text-zinc-600">
                  No matches.
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function ParentRowLabel({ lane }: { lane: Swimlane }) {
  const f = lane.row.fields;
  const type = workItemTypeStyle(f['System.WorkItemType']);
  return (
    <span className="flex items-center gap-1.5 min-w-0 flex-1">
      <span
        className="h-1.5 w-1.5 rounded-full shrink-0"
        style={{ backgroundColor: type.dot }}
        aria-hidden
      />
      <span className="text-zinc-400 shrink-0">{type.label}</span>
      <span className="mono text-[11px] text-zinc-600 shrink-0">#{lane.row.id}</span>
      <span className="text-zinc-100 truncate">{f['System.Title']}</span>
    </span>
  );
}
