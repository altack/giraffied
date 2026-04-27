import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, Palette } from 'lucide-react';
import { useTheme, THEMES, type Theme } from '@/state/theme.store';
import { cn } from '@/lib/cn';

const POPOVER_WIDTH = 220;
const POPOVER_MAX_HEIGHT = 240;

/** Top-bar icon trigger that opens a small popover with three theme rows
 *  (Classic / Dark / Light). Mirrors the popover pattern used by AssigneeFilter
 *  and OverallTracking — fixed-position portal, reflow on scroll/resize, click-
 *  outside + Esc to close. The store's `setTheme` applies `data-theme` to
 *  `<html>` synchronously, so the swap is instant; the body's bg transition
 *  handles the easing. */
export function ThemeMenu() {
  const theme = useTheme((s) => s.theme);
  const setTheme = useTheme((s) => s.setTheme);
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const close = useCallback(() => setOpen(false), []);

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
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  const placement = rect
    ? (() => {
        const spaceBelow = window.innerHeight - rect.bottom;
        const flipUp = spaceBelow < POPOVER_MAX_HEIGHT && rect.top > spaceBelow;
        const top = flipUp ? Math.max(8, rect.top - POPOVER_MAX_HEIGHT - 4) : rect.bottom + 4;
        // Right-align to the trigger so the popover's edge matches the icon's right edge.
        const rightAligned = rect.right - POPOVER_WIDTH;
        const left = Math.max(
          8,
          Math.min(rightAligned, window.innerWidth - POPOVER_WIDTH - 8),
        );
        const alignedRight = left + POPOVER_WIDTH >= rect.right - 4;
        const origin = flipUp
          ? alignedRight
            ? 'from-bottom-right'
            : 'from-bottom-left'
          : alignedRight
            ? 'from-top-right'
            : 'from-top-left';
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
        onClick={toggle}
        title="Appearance"
        aria-label="Appearance"
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'inline-flex items-center justify-center h-7 w-7 rounded-md transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60',
          open
            ? 'bg-[var(--color-overlay-1)] text-[var(--color-ink)]'
            : 'text-[var(--color-ink-muted)] hover:bg-[var(--color-overlay-soft)] hover:text-[var(--color-ink)]',
        )}
      >
        <Palette className="h-3.5 w-3.5" />
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
            role="menu"
            aria-label="Appearance"
          >
            <div className="px-3 pt-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-ink-dim)]">
              Appearance
            </div>
            <div className="pb-1">
              {THEMES.map((t) => (
                <ThemeRow
                  key={t.id}
                  theme={t}
                  active={theme === t.id}
                  onClick={() => {
                    setTheme(t.id);
                    close();
                  }}
                />
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function ThemeRow({
  theme,
  active,
  onClick,
}: {
  theme: { id: Theme; label: string; description: string };
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="menuitemradio"
      aria-checked={active}
      className={cn(
        'flex w-full items-center gap-2.5 px-3 py-1.5 text-[12.5px] text-left transition-colors',
        active ? 'text-[var(--color-ink)]' : 'text-[var(--color-ink-muted)]',
        'hover:bg-[var(--color-overlay-1)]',
      )}
    >
      <ThemeSwatch id={theme.id} />
      <span className="flex-1 min-w-0">
        <span className="block leading-tight">{theme.label}</span>
        <span className="block text-[10.5px] leading-tight text-[var(--color-ink-dim)] truncate">
          {theme.description}
        </span>
      </span>
      {active && <Check className="h-3.5 w-3.5 text-emerald-400/80 shrink-0" />}
    </button>
  );
}

/** Tiny canvas/ink preview chip for each theme. Hardcoded literals — these
 *  are *previews* of what each theme renders as, so they shouldn't reuse the
 *  theme tokens (which would all show the current theme). */
function ThemeSwatch({ id }: { id: Theme }) {
  const fills: Record<Theme, { bg: string; line: string; ring: string }> = {
    classic: { bg: '#08080a', line: '#e6e6ea', ring: 'rgb(255 255 255 / 0.14)' },
    dark:    { bg: '#1c1d22', line: '#b8b9c0', ring: 'rgb(255 255 255 / 0.10)' },
    light:   { bg: '#ffffff', line: '#0f1014', ring: 'rgb(15 16 20 / 0.16)' },
  };
  const f = fills[id];
  return (
    <span
      aria-hidden
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
      style={{ background: f.bg, boxShadow: `inset 0 0 0 1px ${f.ring}` }}
    >
      <span
        className="block h-[2px] w-2.5 rounded-full"
        style={{ background: f.line, opacity: 0.9 }}
      />
    </span>
  );
}
