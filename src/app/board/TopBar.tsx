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
    <header className="flex items-center justify-between border-b border-zinc-800 px-5 py-2.5 bg-zinc-950">
      <div className="flex items-center gap-3 min-w-0">
        <h1 className="text-sm font-semibold text-zinc-200 shrink-0">Jirafied</h1>
        <span className="text-zinc-700">·</span>
        <span className="text-sm text-zinc-300 font-medium truncate">
          {iteration?.name ?? 'No current iteration'}
        </span>
        {range && <span className="text-xs text-zinc-500 shrink-0">{range}</span>}
        <span className="text-zinc-700">·</span>
        <span className="text-xs text-zinc-500 truncate">
          {org} / {projectName} / {teamName}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" title="Refresh" onClick={onRefresh} disabled={isFetching}>
          {isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
        <Button variant="ghost" size="icon" title="Sign out" onClick={() => reset()}>
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
