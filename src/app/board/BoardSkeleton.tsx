import { cn } from '@/lib/cn';

/** Board-shaped loading state. Shown while the sprint fetch is in-flight so
 *  the user sees the target layout forming rather than a stalled empty
 *  canvas. Uses `.jfd-shimmer` (defined in globals.css) for the animated
 *  highlight, clamped to fixed widths/heights so the rhythm reads like real
 *  content is being placed. */
export function BoardSkeleton() {
  return (
    <div className="flex-1 overflow-auto">
      <div className="px-5 pt-3 pb-6 space-y-4" style={{ minWidth: 4 * 260 + 3 * 12 + 40 }}>
        {/* Column headers row */}
        <div className="sticky top-0 z-20 -mx-5 px-5 py-2 bg-[var(--color-canvas)]/75 backdrop-blur-lg border-b border-white/[0.05]">
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2 px-1">
                <SkelBar className="h-3 w-20" />
                <SkelBar className="h-3 w-4" />
              </div>
            ))}
          </div>
        </div>

        {/* A few swimlanes. Different card counts per lane keeps the rhythm
            from looking mechanical. */}
        {([
          [2, 1, 3, 1],
          [1, 2, 2, 0],
          [3, 1, 1, 2],
        ] as const).map((cardCounts, laneIdx) => (
          <div key={laneIdx} className="space-y-3">
            <div className="flex items-center gap-2 py-1 px-1">
              <div className="h-1.5 w-1.5 rounded-full bg-white/[0.10]" />
              <SkelBar className="h-3 w-16" />
              <SkelBar className="h-3 w-10" />
              <SkelBar className="h-3 w-48" />
            </div>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
              {cardCounts.map((n, colIdx) => (
                <div
                  key={colIdx}
                  className="rounded-lg border border-white/[0.04] p-1.5 space-y-1.5 min-h-[96px]"
                >
                  {Array.from({ length: n }).map((_, cardIdx) => (
                    <SkelCard key={cardIdx} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SkelBar({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'rounded-sm bg-white/[0.04] jfd-shimmer',
        className,
      )}
    />
  );
}

function SkelCard() {
  return (
    <div className="rounded-md border border-white/[0.05] bg-white/[0.02] p-2 space-y-1.5 lit-top jfd-shimmer">
      <div className="flex items-center gap-1.5">
        <div className="h-1.5 w-1.5 rounded-full bg-white/[0.10]" />
        <div className="h-2.5 rounded bg-white/[0.05] flex-1" />
      </div>
      <div className="h-2.5 rounded bg-white/[0.05] w-3/4" />
      <div className="flex items-center justify-between pt-1">
        <div className="h-2 rounded bg-white/[0.04] w-10" />
        <div className="h-4 w-4 rounded-full bg-white/[0.06]" />
      </div>
    </div>
  );
}
