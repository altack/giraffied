import { Pin, PinOff } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Small pin/unpin toggle shown in the action slot of a sidebar FieldRow. The
 *  caller controls hover-reveal by wrapping the row in a `group`; this button
 *  ships with `opacity-0 group-hover:opacity-100` baked in so it never intrudes
 *  when the user isn't aiming at it. */
export function PinButton({
  pinned,
  onToggle,
  label,
  disabled = false,
}: {
  pinned: boolean;
  onToggle: () => void;
  label: string;
  disabled?: boolean;
}) {
  const Icon = pinned ? PinOff : Pin;
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-label={pinned ? `Unpin ${label}` : `Pin ${label}`}
      title={pinned ? 'Unpin' : 'Pin to top'}
      className={cn(
        'inline-flex items-center justify-center h-5 w-5 rounded',
        'text-zinc-600 hover:text-zinc-200 hover:bg-white/[0.06]',
        'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
        'disabled:hover:bg-transparent disabled:cursor-not-allowed',
        'transition-opacity transition-colors duration-150',
      )}
    >
      <Icon className="h-3 w-3" />
    </button>
  );
}
