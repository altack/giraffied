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
  onClose: () => void;
  title: ReactNode;
  /** Optional: right-side slot in the header for secondary actions (before close). */
  headerActions?: ReactNode;
  footer?: ReactNode;
  /** Target width in px. Height grows with content up to `maxHeightVh`. */
  width?: number;
  maxHeightVh?: number;
  children: ReactNode;
}

const EDGE_MARGIN = 8;

export function DraggableModal({
  open,
  onClose,
  title,
  headerActions,
  footer,
  width = 520,
  maxHeightVh = 84,
  children,
}: DraggableModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Position | null>(null);
  const dragOffset = useRef<Position | null>(null);

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

  // Esc to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

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

  if (!open) return null;

  const style: React.CSSProperties = {
    width,
    maxHeight: `${maxHeightVh}vh`,
    ...(pos ? { left: pos.x, top: pos.y } : { visibility: 'hidden' }),
  };

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      className={cn(
        'fixed z-50 flex flex-col',
        'rounded-xl border border-white/[0.08]',
        'bg-[var(--color-surface-1)]/95 backdrop-blur-xl',
        'shadow-2xl shadow-black/50',
        'lit-top',
      )}
      style={style}
    >
      <div
        className="flex items-center gap-2 pl-3 pr-2 py-2 border-b border-white/[0.06] cursor-grab active:cursor-grabbing select-none touch-none"
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        onPointerCancel={onHeaderPointerUp}
      >
        <GripHorizontal className="h-3.5 w-3.5 text-zinc-600 shrink-0" aria-hidden />
        <div className="flex-1 min-w-0 text-[12px] font-medium text-zinc-300 truncate">
          {title}
        </div>
        {headerActions}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-auto">{children}</div>
      {footer && (
        <div className="border-t border-white/[0.06] px-4 py-2.5 flex items-center justify-end gap-2">
          {footer}
        </div>
      )}
    </div>,
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
