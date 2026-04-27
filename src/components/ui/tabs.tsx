import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface TabItem<V extends string = string> {
  value: V;
  label: ReactNode;
  /** Optional badge shown to the right of the label (e.g. count). */
  badge?: ReactNode;
}

/** Minimal segmented tabs bar — purely visual/click. Parent owns the selected value. */
export function Tabs<V extends string>({
  value,
  onChange,
  items,
  className,
}: {
  value: V;
  onChange: (v: V) => void;
  items: TabItem<V>[];
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        'inline-flex items-center gap-0.5 rounded-md border border-[var(--color-hairline)] bg-[var(--color-overlay-soft)] p-0.5',
        className,
      )}
    >
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded px-2.5 h-7 text-[12px] font-medium',
              'transition-colors duration-120',
              active
                ? 'bg-[var(--color-overlay-2)] text-[var(--color-ink)] lit-top'
                : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-overlay-soft)]',
            )}
          >
            <span>{it.label}</span>
            {it.badge != null && (
              <span
                className={cn(
                  'mono text-[10px] rounded-[3px] px-1 py-px',
                  active ? 'bg-[var(--color-overlay-1)] text-[var(--color-ink)]' : 'bg-[var(--color-overlay-soft)] text-[var(--color-ink-muted)]',
                )}
              >
                {it.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
