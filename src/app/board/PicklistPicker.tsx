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
  clearable = true,
}: {
  value: string;
  options: string[];
  onChange: (next: string) => void;
  placeholder?: string;
  clearLabel?: string;
  disabled?: boolean;
  /** When false, hides the leading "None" entry. Use for fields that must
   *  always have a value (e.g. Status). */
  clearable?: boolean;
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

  const placement = rect
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
        const alignedRight = left + POPOVER_WIDTH >= rect.right - 4;
        const origin = flipUp
          ? alignedRight ? 'from-bottom-right' : 'from-bottom-left'
          : alignedRight ? 'from-top-right' : 'from-top-left';
        return {
          style: { position: 'fixed', top, left, width: POPOVER_WIDTH } as React.CSSProperties,
          origin,
        };
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
          'bg-[var(--color-overlay-soft)] border border-[var(--color-hairline-strong)] text-[var(--color-ink)]',
          'hover:bg-[var(--color-overlay-1)]',
          'focus-visible:outline-none focus-visible:border-indigo-400/40 focus-visible:ring-2 focus-visible:ring-indigo-400/15',
          'disabled:opacity-60 disabled:cursor-not-allowed',
          'transition-colors duration-150',
        )}
      >
        <span
          className={cn('truncate flex-1', !value && 'text-[var(--color-ink-dim)]')}
        >
          {value || placeholder}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-[var(--color-ink-muted)] shrink-0" />
      </button>
      {open &&
        placement &&
        createPortal(
          <div
            ref={popRef}
            data-no-drag
            style={{ ...placement.style, zIndex: 60 }}
            className={cn(
              'rounded-md overflow-hidden jfd-glass-panel jfd-popover-enter',
              placement.origin,
            )}
          >
            <div className="p-1.5 border-b border-[var(--color-hairline)]">
              <Input
                autoFocus
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search…"
                className="h-7"
              />
            </div>
            <div className="max-h-64 overflow-auto py-1">
              {clearable && (
                <button
                  type="button"
                  onClick={() => pick('')}
                  className={cn(
                    'w-full flex items-center gap-2 px-2.5 py-1.5 text-[13px] text-[var(--color-ink-muted)] hover:bg-[var(--color-overlay-1)]',
                    value === '' && 'bg-[var(--color-overlay-soft)] text-[var(--color-ink)]',
                  )}
                >
                  <Minus className="h-4 w-4 text-[var(--color-ink-muted)]" />
                  {clearLabel}
                </button>
              )}
              {results.map((opt) => {
                const selected = opt === value;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => pick(opt)}
                    title={opt}
                    className={cn(
                      'w-full flex items-start gap-2 px-2.5 py-1.5 text-[13px] text-[var(--color-ink)] hover:bg-[var(--color-overlay-1)]',
                      selected && 'bg-[var(--color-overlay-soft)]',
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
                <div className="px-2.5 py-2 text-[12px] text-[var(--color-ink-dim)]">No matches.</div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
