import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Detect macOS so we can render ⌘ vs Ctrl on the shortcut hint. The
 *  keyboard handler in Board.tsx already accepts both, regardless of what
 *  the hint says. */
function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPod|iPhone|iPad/.test(navigator.platform);
}

export function SearchTrigger({ onOpen }: { onOpen: () => void }) {
  const [isMac, setIsMac] = useState(false);

  // Read platform on mount so SSR/hydration doesn't warn about mismatch. (The
  // extension doesn't SSR but being cautious is free.)
  useEffect(() => {
    setIsMac(isMacPlatform());
  }, []);

  return (
    <button
      type="button"
      onClick={onOpen}
      title="Search work items"
      aria-label="Open search"
      className={cn(
        'group inline-flex items-center gap-2 h-7 w-[220px] px-2 rounded-md text-left',
        'bg-[var(--color-overlay-soft)] border border-[var(--color-hairline)] lit-top',
        'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-overlay-1)] hover:border-[var(--color-hairline-strong)]',
        'transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60',
      )}
    >
      <Search className="h-3.5 w-3.5 shrink-0 opacity-80 group-hover:opacity-100" aria-hidden />
      <span className="flex-1 text-[12px] truncate">Search work items…</span>
      <span
        className="mono text-[10px] text-[var(--color-ink-dim)] shrink-0 px-1 py-px rounded border border-[var(--color-hairline)] bg-[var(--color-overlay-soft)]"
        aria-hidden
      >
        {isMac ? '⌘K' : 'Ctrl K'}
      </span>
    </button>
  );
}
