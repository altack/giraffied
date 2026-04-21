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
        'inline-flex items-center gap-0.5 rounded-md border border-white/[0.06] bg-white/[0.02] p-0.5',
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
                ? 'bg-white/[0.08] text-zinc-100 lit-top'
                : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.03]',
            )}
          >
            <span>{it.label}</span>
            {it.badge != null && (
              <span
                className={cn(
                  'mono text-[10px] rounded-[3px] px-1 py-px',
                  active ? 'bg-white/[0.06] text-zinc-300' : 'bg-white/[0.04] text-zinc-500',
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
