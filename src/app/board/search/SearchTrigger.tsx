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
        'bg-white/[0.03] border border-white/[0.06] lit-top',
        'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05] hover:border-white/[0.10]',
        'transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60',
      )}
    >
      <Search className="h-3.5 w-3.5 shrink-0 opacity-80 group-hover:opacity-100" aria-hidden />
      <span className="flex-1 text-[12px] truncate">Search work items…</span>
      <span
        className="mono text-[10px] text-zinc-600 shrink-0 px-1 py-px rounded border border-white/[0.06] bg-white/[0.02]"
        aria-hidden
      >
        {isMac ? '⌘K' : 'Ctrl K'}
      </span>
    </button>
  );
}
