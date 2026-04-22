import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CalendarOff, Loader2 } from 'lucide-react';
import { useTaskboard } from '@/ado/hooks/useTaskboard';
import type { AdoIdentity } from '@/ado/types';
import { AdoError } from '@/ado/client';
import { useSettings } from '@/state/settings.store';
import { laneContextKey, useCollapsedLanes } from '@/state/collapsedLanes.store';
import { TopBar } from './TopBar';
import { BoardGrid } from './BoardGrid';
import { assigneeKey, assigneesOnBoard } from './assigneesOnBoard';

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

  // Derive the same lane-key set BoardGrid uses (lane-${parentId} + lane-unparented).
  // Cheap to recompute here; duplicating 3 lines beats plumbing a callback from the grid.
  const laneKeys = useMemo<string[]>(() => {
    if (!board) return [];
    const keys = board.swimlanes.map((lane) => `lane-${lane.row.id}`);
    if (board.unparented.length > 0) keys.push('lane-unparented');
    return keys;
  }, [board]);

  const org = useSettings((s) => s.org);
  const projectId = useSettings((s) => s.projectId);
  const teamId = useSettings((s) => s.teamId);
  const contextKey = laneContextKey(org, projectId, teamId, iteration?.id);
  const collapsedArr = useCollapsedLanes((s) =>
    contextKey ? s.byContext[contextKey] : undefined,
  );
  const collapseAll = useCollapsedLanes((s) => s.collapseAll);
  const expandAll = useCollapsedLanes((s) => s.expandAll);
  const expandLanes = useCollapsedLanes((s) => s.expandLanes);

  const allCollapsed =
    laneKeys.length > 0 &&
    !!collapsedArr &&
    laneKeys.every((k) => collapsedArr.includes(k));

  const toggleAllLanes = () => {
    if (!contextKey || laneKeys.length === 0) return;
    if (allCollapsed) expandAll(contextKey);
    else collapseAll(contextKey, laneKeys);
  };

  const boardAssignees = useMemo(() => assigneesOnBoard(board), [board]);
  // Modal's assignee picker wants identity-only alphabetical list — derive
  // from the counted shape to avoid a second pass over the board data.
  const modalAssignees = useMemo(
    () =>
      [...boardAssignees]
        .sort((a, b) =>
          a.identity.displayName.localeCompare(b.identity.displayName, undefined, {
            sensitivity: 'base',
          }),
        )
        .map((e) => e.identity),
    [boardAssignees],
  );

  const [assigneeFilter, setAssigneeFilter] = useState<string | null>(null);

  // If the selected assignee disappears from the board (refetch removed their
  // cards, they were reassigned, etc.) silently clear the filter — otherwise
  // the view would be stuck empty with no visible affordance.
  useEffect(() => {
    if (!assigneeFilter) return;
    if (!boardAssignees.some((e) => e.key === assigneeFilter)) {
      setAssigneeFilter(null);
    }
  }, [assigneeFilter, boardAssignees]);

  // When a filter is applied, expand the lanes that actually contain the
  // filtered person's work so their cards are visible without a manual click.
  // We only touch lanes whose parent or any child matches — unrelated lanes
  // keep their user-set collapse state. And we only fire on filter
  // activation/change (tracked by a ref), not on every board refetch — that
  // way if the user manually re-collapses a lane while filtered, we don't
  // fight them the next time the 30s poll lands fresh data.
  const lastAutoExpandRef = useRef<string | null>(null);
  useEffect(() => {
    if (!assigneeFilter) {
      lastAutoExpandRef.current = null;
      return;
    }
    if (lastAutoExpandRef.current === assigneeFilter) return;
    if (!contextKey || !board) return;
    lastAutoExpandRef.current = assigneeFilter;

    const matching: string[] = [];
    for (const lane of board.swimlanes) {
      const parentMatches =
        assigneeKey(lane.row.fields['System.AssignedTo']) === assigneeFilter;
      const hasMatchingChild = lane.tasks.some(
        (t) => assigneeKey(t.workItem.fields['System.AssignedTo']) === assigneeFilter,
      );
      if (parentMatches || hasMatchingChild) matching.push(`lane-${lane.row.id}`);
    }
    const unparentedMatches = board.unparented.some(
      (t) => assigneeKey(t.workItem.fields['System.AssignedTo']) === assigneeFilter,
    );
    if (unparentedMatches) matching.push('lane-unparented');

    if (matching.length > 0) expandLanes(contextKey, matching);
  }, [assigneeFilter, contextKey, board, expandLanes]);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <TopBar
        iteration={iteration ?? undefined}
        onRefresh={refetch}
        isFetching={isFetching}
        canToggleLanes={laneKeys.length > 0}
        allLanesCollapsed={allCollapsed}
        onToggleAllLanes={toggleAllLanes}
        board={board}
        assignees={boardAssignees}
        assigneeFilter={assigneeFilter}
        onAssigneeFilter={setAssigneeFilter}
      />
      <BoardBody
        iterationLoading={iterationLoading}
        iterationError={iterationError}
        hasIteration={!!iteration}
        iterationId={iteration?.id}
        boardLoading={boardLoading}
        boardError={boardError}
        board={board}
        assignees={modalAssignees}
        assigneeFilter={assigneeFilter}
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
  assignees,
  assigneeFilter,
}: {
  iterationLoading: boolean;
  iterationError: unknown;
  hasIteration: boolean;
  iterationId: string | undefined;
  boardLoading: boolean;
  boardError: unknown;
  board: ReturnType<typeof useTaskboard>['board'];
  assignees: AdoIdentity[];
  assigneeFilter: string | null;
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

  return (
    <BoardGrid
      data={board}
      iterationId={iterationId}
      assignees={assignees}
      assigneeFilter={assigneeFilter}
    />
  );
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
