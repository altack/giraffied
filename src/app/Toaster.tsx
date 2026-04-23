import { createPortal } from 'react-dom';
import { AlertCircle, Check } from 'lucide-react';
import { useToasts, type Toast } from '@/state/toasts.store';
import { cn } from '@/lib/cn';

/** Global toast surface — one fixed bottom-right stack, portaled so it
 *  escapes any parent clipping. Each toast enters with `jfd-toast-in` on
 *  mount; the store auto-dismisses after its timeout. We don't play an
 *  explicit exit animation here — dismissal is simple opacity-fade via
 *  transition on the individual item's wrapper. */
export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  return createPortal(
    <div
      aria-live="polite"
      className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>,
    document.body,
  );
}

function ToastItem({ toast }: { toast: Toast }) {
  const isError = toast.tone === 'error';
  return (
    <div
      role="status"
      className={cn(
        'jfd-toast-in pointer-events-auto flex items-center gap-2',
        'rounded-md px-3 py-2 text-[12.5px] lit-top',
        'border backdrop-blur-xl shadow-2xl shadow-black/50',
        isError
          ? 'bg-red-500/10 border-red-500/25 text-red-100'
          : 'bg-[var(--color-surface-2)]/85 border-white/[0.08] text-zinc-100',
      )}
    >
      {isError ? (
        <AlertCircle className="h-3.5 w-3.5 text-red-300 shrink-0" />
      ) : (
        <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
      )}
      <span className="truncate max-w-[320px]">{toast.message}</span>
    </div>
  );
}
