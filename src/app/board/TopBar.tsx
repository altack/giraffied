import { RefreshCw, LogOut, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSettings } from '@/state/settings.store';
import type { AdoIteration } from '@/ado/types';

function formatRange(iteration: AdoIteration | undefined): string | null {
  if (!iteration) return null;
  const { startDate, finishDate } = iteration.attributes;
  if (!startDate || !finishDate) return null;
  const fmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
  return `${fmt.format(new Date(startDate))} – ${fmt.format(new Date(finishDate))}`;
}

export function TopBar({
  iteration,
  onRefresh,
  isFetching,
}: {
  iteration: AdoIteration | undefined;
  onRefresh: () => void;
  isFetching: boolean;
}) {
  const { org, projectName, teamName, reset } = useSettings();
  const range = formatRange(iteration);

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between px-5 h-11 bg-[var(--color-canvas)]/70 backdrop-blur-lg border-b border-white/[0.05]">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-[13px] font-semibold tracking-tight bg-gradient-to-r from-indigo-300 via-violet-300 to-indigo-200 bg-clip-text text-transparent">
          Jirafied 🦒
        </span>
        <Sep />
        <span className="text-[13px] text-zinc-100 font-medium truncate">
          {iteration?.name ?? 'No current iteration'}
        </span>
        {range && (
          <span className="mono text-[11px] text-zinc-500 shrink-0">{range}</span>
        )}
        <Sep />
        <span className="text-[12px] text-zinc-500 truncate">
          {org} <span className="text-zinc-700 mx-1">/</span> {projectName}{' '}
          <span className="text-zinc-700 mx-1">/</span> {teamName}
        </span>
      </div>
      <div className="flex items-center gap-0.5">
        <Button variant="ghost" size="icon" title="Refresh" onClick={onRefresh} disabled={isFetching}>
          {isFetching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
        </Button>
        <Button variant="ghost" size="icon" title="Sign out" onClick={() => reset()}>
          <LogOut className="h-3.5 w-3.5" />
        </Button>
      </div>
    </header>
  );
}

function Sep() {
  return <span className="text-zinc-800 select-none">·</span>;
}
