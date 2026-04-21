import { AlertCircle, CalendarOff, Loader2 } from 'lucide-react';
import { useTaskboard } from '@/ado/hooks/useTaskboard';
import { AdoError } from '@/ado/client';
import { TopBar } from './TopBar';
import { BoardGrid } from './BoardGrid';

export function Board() {
  const {
    iteration,
    iterationLoading,
    iterationError,
    board,
    boardLoading,
    boardError,
    refetch,
    isFetching,
  } = useTaskboard();

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <TopBar iteration={iteration ?? undefined} onRefresh={refetch} isFetching={isFetching} />
      <BoardBody
        iterationLoading={iterationLoading}
        iterationError={iterationError}
        hasIteration={!!iteration}
        iterationId={iteration?.id}
        boardLoading={boardLoading}
        boardError={boardError}
        board={board}
      />
    </div>
  );
}

function BoardBody({
  iterationLoading,
  iterationError,
  hasIteration,
  iterationId,
  boardLoading,
  boardError,
  board,
}: {
  iterationLoading: boolean;
  iterationError: unknown;
  hasIteration: boolean;
  iterationId: string | undefined;
  boardLoading: boolean;
  boardError: unknown;
  board: ReturnType<typeof useTaskboard>['board'];
}) {
  if (iterationLoading)
    return (
      <CenteredMessage
        icon={<Loader2 className="h-5 w-5 animate-spin" />}
        text="Loading current iteration…"
      />
    );
  if (iterationError) return <ErrorMessage error={iterationError} title="Could not load iteration" />;
  if (!hasIteration) {
    return (
      <CenteredMessage
        icon={<CalendarOff className="h-6 w-6" />}
        text="No current iteration for this team."
        subtext="Configure one in Azure DevOps, then refresh."
      />
    );
  }
  if (boardLoading)
    return (
      <CenteredMessage icon={<Loader2 className="h-5 w-5 animate-spin" />} text="Loading sprint…" />
    );
  if (boardError) return <ErrorMessage error={boardError} title="Could not load sprint" />;
  if (!board || !iterationId) return null;

  if (board.totals.cards === 0) {
    return (
      <CenteredMessage
        icon={<CalendarOff className="h-6 w-6" />}
        text="This sprint is empty."
        subtext="Add work items in Azure DevOps to see them here."
      />
    );
  }

  return <BoardGrid data={board} iterationId={iterationId} />;
}

function CenteredMessage({
  icon,
  text,
  subtext,
}: {
  icon: React.ReactNode;
  text: string;
  subtext?: string;
}) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="text-zinc-600">{icon}</div>
        <div className="text-[13px] text-zinc-300">{text}</div>
        {subtext && <div className="text-[12px] text-zinc-600">{subtext}</div>}
      </div>
    </div>
  );
}

function ErrorMessage({ error, title }: { error: unknown; title: string }) {
  const detail =
    error instanceof AdoError
      ? `${error.status} ${error.statusText} — ${error.body.slice(0, 200)}`
      : error instanceof Error
        ? error.message
        : String(error);
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="max-w-lg rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-[13px] text-red-200 space-y-2 lit-top">
        <div className="flex items-center gap-2 text-red-300 font-semibold">
          <AlertCircle className="h-4 w-4" />
          {title}
        </div>
        <div className="mono text-red-300/70 whitespace-pre-wrap break-words text-xs">
          {detail}
        </div>
      </div>
    </div>
  );
}
