import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Minus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';

const POPOVER_WIDTH = 288;
const POPOVER_MAX_HEIGHT = 320;

/** Searchable single-select popover for a string pick-list (e.g. RCA).
 *  Visually mirrors AssigneePicker so the sidebar reads consistently. */
export function PicklistPicker({
  value,
  options,
  onChange,
  placeholder = '—',
  clearLabel = 'None',
  disabled = false,
}: {
  value: string;
  options: string[];
  onChange: (next: string) => void;
  placeholder?: string;
  clearLabel?: string;
  disabled?: boolean;
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

  const results = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [filter, options]);

  const pick = useCallback(
    (next: string) => {
      onChange(next);
      setOpen(false);
      setFilter('');
    },
    [onChange],
  );

  function toggle() {
    if (disabled) return;
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
        const left = Math.max(
          8,
          Math.min(rightAligned, window.innerWidth - POPOVER_WIDTH - 8),
        );
        return { position: 'fixed', top, left, width: POPOVER_WIDTH };
      })()
    : null;

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={toggle}
        title={value || undefined}
        className={cn(
          'w-full h-8 flex items-center gap-2 rounded-md px-2.5 text-[13px] text-left',
          'bg-white/[0.03] border border-white/[0.08] text-zinc-100',
          'hover:bg-white/[0.05]',
          'focus-visible:outline-none focus-visible:border-indigo-400/40 focus-visible:ring-2 focus-visible:ring-indigo-400/15',
          'disabled:opacity-60 disabled:cursor-not-allowed',
          'transition-colors duration-150',
        )}
      >
        <span
          className={cn('truncate flex-1', !value && 'text-zinc-600')}
        >
          {value || placeholder}
        </span>
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
                placeholder="Search…"
                className="h-7"
              />
            </div>
            <div className="max-h-64 overflow-auto py-1">
              <button
                type="button"
                onClick={() => pick('')}
                className={cn(
                  'w-full flex items-center gap-2 px-2.5 py-1.5 text-[13px] text-zinc-400 hover:bg-white/[0.04]',
                  value === '' && 'bg-white/[0.03] text-zinc-100',
                )}
              >
                <Minus className="h-4 w-4 text-zinc-500" />
                {clearLabel}
              </button>
              {results.map((opt) => {
                const selected = opt === value;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => pick(opt)}
                    title={opt}
                    className={cn(
                      'w-full flex items-start gap-2 px-2.5 py-1.5 text-[13px] text-zinc-200 hover:bg-white/[0.04]',
                      selected && 'bg-white/[0.03]',
                    )}
                  >
                    <span className="flex-1 text-left leading-snug line-clamp-2 break-words">
                      {opt}
                    </span>
                    {selected && (
                      <Check className="h-3.5 w-3.5 text-indigo-300 mt-0.5 shrink-0" />
                    )}
                  </button>
                );
              })}
              {results.length === 0 && (
                <div className="px-2.5 py-2 text-[12px] text-zinc-600">No matches.</div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
