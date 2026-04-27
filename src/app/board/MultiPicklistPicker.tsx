import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Plus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';

const POPOVER_WIDTH = 240;
const POPOVER_MAX_HEIGHT = 320;

/** Tag-style multi-select where values are restricted to a pick-list (e.g. Environment).
 *  Shows selected values as chips with X; a trailing "+" opens a popover listing the
 *  remaining options. */
export function MultiPicklistPicker({
  values,
  options,
  onChange,
  placeholder = 'None',
  disabled = false,
}: {
  values: string[];
  options: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
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

  const remaining = useMemo(() => {
    const lower = new Set(values.map((v) => v.toLowerCase()));
    const avail = options.filter((o) => !lower.has(o.toLowerCase()));
    const q = filter.trim().toLowerCase();
    if (!q) return avail;
    return avail.filter((o) => o.toLowerCase().includes(q));
  }, [filter, options, values]);

  function toggle() {
    if (disabled) return;
    if (!open && btnRef.current) {
      setRect(btnRef.current.getBoundingClientRect());
    }
    setOpen((o) => !o);
  }

  function add(opt: string) {
    if (disabled) return;
    if (values.some((v) => v.toLowerCase() === opt.toLowerCase())) return;
    onChange([...values, opt]);
    setFilter('');
    // Keep open so user can add multiple quickly; close when they click away.
  }

  function remove(opt: string) {
    if (disabled) return;
    onChange(values.filter((v) => v !== opt));
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
    <div
      className={cn(
        'flex flex-wrap items-center gap-1 min-h-[32px] rounded-md px-1.5 py-1',
        'bg-[var(--color-overlay-soft)] border border-[var(--color-hairline-strong)]',
        'transition-colors duration-150',
      )}
    >
      {values.length === 0 && (
        <span className="text-[12px] text-[var(--color-ink-dim)] px-1">{placeholder}</span>
      )}
      {values.map((v) => (
        <span
          key={v}
          className={cn(
            'inline-flex items-center gap-0.5 rounded bg-[var(--color-overlay-1)] py-0.5 text-[11px] text-[var(--color-ink)] lit-top',
            // Even right padding when the × button isn't rendered, so the label
            // doesn't sit flush against the rounded edge.
            disabled ? 'px-2' : 'pl-2 pr-0.5',
            'jfd-chip-in',
          )}
        >
          {v}
          {!disabled && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => remove(v)}
              aria-label={`Remove ${v}`}
              className="inline-flex items-center justify-center h-4 w-4 rounded text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-overlay-2)] transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}
      {!disabled && (
        <button
          ref={btnRef}
          type="button"
          onClick={toggle}
          aria-label="Add value"
          className={cn(
            'inline-flex ml-auto items-center justify-center h-5 w-5 rounded',
            'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-overlay-1)] transition-colors',
          )}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      )}
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
              {remaining.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => add(opt)}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[13px] text-[var(--color-ink)] hover:bg-[var(--color-overlay-1)]"
                >
                  <span className="flex-1 text-left truncate">{opt}</span>
                </button>
              ))}
              {remaining.length === 0 && (
                <div className="px-2.5 py-2 text-[12px] text-[var(--color-ink-dim)]">
                  {values.length === options.length ? 'All added.' : 'No matches.'}
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
