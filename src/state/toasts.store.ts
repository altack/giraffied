import { create } from 'zustand';

/** Transient confirmation surface — pushed from anywhere, auto-dismissed.
 *  Not persisted: toasts are ephemeral by design, and restoring them on
 *  extension reload would feel uncanny. */
export type ToastTone = 'success' | 'error';

export interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastsState {
  toasts: Toast[];
  push: (message: string, tone?: ToastTone) => number;
  dismiss: (id: number) => void;
}

let counter = 0;
const DEFAULT_TIMEOUT_MS = 2400;

export const useToasts = create<ToastsState>((set, get) => ({
  toasts: [],
  push: (message, tone = 'success') => {
    const id = ++counter;
    set((s) => ({ toasts: [...s.toasts, { id, tone, message }] }));
    // Auto-dismiss after the timeout. The Toaster component handles the
    // exit-animation delay before actually removing from the DOM.
    setTimeout(() => get().dismiss(id), DEFAULT_TIMEOUT_MS);
    return id;
  },
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
