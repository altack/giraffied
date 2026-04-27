import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { X, GripHorizontal } from 'lucide-react';
import { cn } from '@/lib/cn';

interface Position {
  x: number;
  y: number;
}

interface DraggableModalProps {
  open: boolean;
  /** Hard close — used by the parent's Cancel button. Always closes, no prompt. */
  onClose: () => void;
  /** Soft close — fired by the X button in the header and by Esc. The parent
   *  can intercept this to prompt about unsaved changes before calling
   *  `onClose`. Defaults to `onClose` when omitted. */
  onCloseRequest?: () => void;
  title: ReactNode;
  /** Optional: right-side slot in the header for secondary actions (before close). */
  headerActions?: ReactNode;
  footer?: ReactNode;
  /** Target width in px. */
  width?: number;
  /** Height in vh. When `fixedHeight` is true the panel is locked to exactly this
   *  height so switching tabs / growing content doesn't make the dialog jump. */
  heightVh?: number;
  fixedHeight?: boolean;
  children: ReactNode;
}

const EDGE_MARGIN = 8;

export function DraggableModal({
  open,
  onClose,
  onCloseRequest,
  title,
  headerActions,
  footer,
  width = 520,
  heightVh = 84,
  fixedHeight = false,
  children,
}: DraggableModalProps) {
  const requestClose = onCloseRequest ?? onClose;
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Position | null>(null);
  const dragOffset = useRef<Position | null>(null);

  // Visual visibility — stays true through the exit animation so the exit
  // classes have time to run before the portal unmounts. Flipping `open`
  // false triggers the out state, which clears to `visible=false` after
  // ~180ms (matching the jfd-modal-out keyframe duration in globals.css).
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
      }, 180);
      return () => clearTimeout(t);
    }
  }, [open, visible]);

  // Center on open. Depends on `open` flip, not position, so dragging the panel
  // doesn't retrigger. Reads current panel size after layout to center accurately.
  useLayoutEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const w = panel?.offsetWidth ?? width;
    const h = panel?.offsetHeight ?? 0;
    setPos({
      x: Math.max(EDGE_MARGIN, Math.round((window.innerWidth - w) / 2)),
      y: Math.max(EDGE_MARGIN, Math.round((window.innerHeight - h) / 3)),
    });
  }, [open, width]);

  // Esc to close — routes through requestClose so the parent can prompt about
  // unsaved changes before letting the modal go away.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, requestClose]);

  // Keep panel within the viewport on window resize.
  useEffect(() => {
    if (!open) return;
    const onResize = () => {
      setPos((p) => (p ? clampToViewport(p, panelRef.current) : p));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open]);

  const onHeaderPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Only start drag on primary button and when the target isn't an interactive
    // control (so the close button inside the header still works).
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, select, textarea, [data-no-drag]')) return;

    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }, []);

  const onHeaderPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const offset = dragOffset.current;
    if (!offset) return;
    setPos(
      clampToViewport(
        { x: e.clientX - offset.x, y: e.clientY - offset.y },
        panelRef.current,
      ),
    );
  }, []);

  const onHeaderPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (dragOffset.current) {
      dragOffset.current = null;
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    }
  }, []);

  if (!visible) return null;

  const style: React.CSSProperties = {
    width,
    ...(fixedHeight
      ? { height: `${heightVh}vh` }
      : { maxHeight: `${heightVh}vh` }),
    ...(pos ? { left: pos.x, top: pos.y } : { visibility: 'hidden' }),
  };

  return createPortal(
    <>
      {/* Backdrop blocks all interactions with the board behind the modal,
       * but does NOT dismiss on click — the user has to commit to Cancel /
       * Save / X to close. The panel above is still draggable via its title
       * bar; only the canvas behind is locked. */}
      <div
        aria-hidden
        onMouseDown={(e) => e.preventDefault()}
        className={cn(
          // Theme-aware dim — light mode flips to a much softer wash so the
          // modal is anchored to the board without smudging the canvas behind it.
          'fixed inset-0 z-40 bg-[var(--color-modal-backdrop)]',
          exiting ? 'jfd-backdrop-out' : 'jfd-backdrop-in',
        )}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        className={cn(
          'fixed z-50 flex flex-col',
          'rounded-xl border border-[var(--color-hairline-strong)]',
          'bg-[var(--color-surface-1)]/95 backdrop-blur-xl',
          'shadow-2xl shadow-black/50',
          'lit-top',
          // Hold the animation back until `pos` is set — first render measures
          // the panel with visibility:hidden, and starting `jfd-modal-in` then
          // would run half the animation invisibly before the user sees it.
          exiting ? 'jfd-modal-out' : pos ? 'jfd-modal-in' : undefined,
        )}
        style={style}
      >
      <div
        className="flex items-center gap-2 pl-3 pr-2 py-2 border-b border-[var(--color-hairline)] cursor-grab active:cursor-grabbing select-none touch-none"
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        onPointerCancel={onHeaderPointerUp}
      >
        <GripHorizontal className="h-3.5 w-3.5 text-[var(--color-ink-dim)] shrink-0" aria-hidden />
        <div className="flex-1 min-w-0 text-[12px] font-medium text-[var(--color-ink-muted)] truncate">
          {title}
        </div>
        {headerActions}
        <button
          type="button"
          onClick={requestClose}
          aria-label="Close"
          className="inline-flex h-6 w-6 items-center justify-center rounded-md cursor-pointer text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-overlay-1)] transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
      {footer && (
        <div className="border-t border-[var(--color-hairline)] px-4 py-2.5 flex items-center justify-end gap-2">
          {footer}
        </div>
      )}
      </div>
    </>,
    document.body,
  );
}

function clampToViewport(p: Position, panel: HTMLDivElement | null): Position {
  const w = panel?.offsetWidth ?? 0;
  const h = panel?.offsetHeight ?? 0;
  const maxX = Math.max(EDGE_MARGIN, window.innerWidth - w - EDGE_MARGIN);
  const maxY = Math.max(EDGE_MARGIN, window.innerHeight - h - EDGE_MARGIN);
  return {
    x: Math.min(Math.max(EDGE_MARGIN, p.x), maxX),
    y: Math.min(Math.max(EDGE_MARGIN, p.y), maxY),
  };
}
