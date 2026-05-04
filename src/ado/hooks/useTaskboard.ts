import { useQuery } from '@tanstack/react-query';
import {
  getIterationWorkItems,
  getTaskboardColumns,
  getTaskboardWorkItems,
  getWorkItemType,
  getWorkItemsBatch,
} from '@/ado/endpoints';
import { AdoError } from '@/ado/client';
import type {
  AdoTaskboardColumn,
  AdoTaskboardWorkItem,
  AdoWorkItem,
} from '@/ado/types';
import { useSettings } from '@/state/settings.store';
import { useCurrentIteration } from './useCurrentIteration';
import {
  collectSafeIds,
  composeBoardData,
  synthesizeFromWorkItemType,
  synthesizeItemsFromWorkItems,
} from './taskboard.helpers';

export interface TaskOnBoard {
  taskboard: AdoTaskboardWorkItem;
  workItem: AdoWorkItem;
}

export interface Swimlane {
  row: AdoWorkItem;
  tasks: TaskOnBoard[];
}

export interface TaskboardData {
  columns: AdoTaskboardColumn[];
  swimlanes: Swimlane[];
  unparented: TaskOnBoard[];
  totals: { cards: number; swimlanes: number };
  /** True when column config was derived because the /taskboardcolumns endpoint wasn't usable. */
  columnsFallback: boolean;
}

function log(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.debug('[giraffied]', ...args);
}

/** Server-side check that fires when a team has never saved taskboard-column config,
 *  and sometimes fires spuriously even for teams whose native UI clearly has columns. */
function isColumnsNotCustomizedError(e: unknown): boolean {
  return (
    e instanceof AdoError &&
    e.status === 400 &&
    /columns are not added|customize the taskboard columns/i.test(e.body)
  );
}

async function tryFetch<T>(label: string, fn: () => Promise<T>): Promise<T | { __err: unknown }> {
  const start = performance.now();
  try {
    const result = await fn();
    log(`${label} ok in ${Math.round(performance.now() - start)}ms`);
    return result;
  } catch (e) {
    log(`${label} failed in ${Math.round(performance.now() - start)}ms`, e);
    return { __err: e };
  }
}

function unwrap<T>(r: T | { __err: unknown }, rethrowUnless: (e: unknown) => boolean): T | null {
  if (r && typeof r === 'object' && '__err' in r) {
    if (rethrowUnless(r.__err)) return null;
    throw r.__err;
  }
  return r;
}

async function loadTaskboard(
  projectId: string,
  teamId: string,
  iterationId: string,
): Promise<TaskboardData> {
  log('loadTaskboard start', { projectId, teamId, iterationId });

  // Step 1: fetch relations + column config in parallel. We need the column config first
  // to decide whether `/taskboardworkitems` is worth calling — when the team hasn't
  // customized columns it's guaranteed to 400, so skip it.
  const [relations, columnsRaw] = await Promise.all([
    tryFetch('iterations/workitems', () =>
      getIterationWorkItems(projectId, teamId, iterationId),
    ),
    tryFetch('taskboardcolumns', () => getTaskboardColumns(projectId, teamId)),
  ]);

  const relationsData = unwrap(relations, () => false);
  if (!relationsData) throw new Error('Unreachable');

  const columnsResultRaw = unwrap(columnsRaw, isColumnsNotCustomizedError);
  // `{columns: [], isCustomized: false}` means the team hasn't customized — treat as
  // null so we skip the guaranteed-to-fail items call and go straight to synthesis.
  const columnsResult =
    columnsResultRaw &&
    columnsResultRaw.isCustomized !== false &&
    columnsResultRaw.columns.length > 0
      ? columnsResultRaw
      : null;

  log('relations', { relationCount: relationsData.workItemRelations.length });
  log('column config', {
    hasCustomColumns: !!columnsResult,
    isCustomized: columnsResultRaw?.isCustomized,
  });

  // Step 2: only hit /taskboardworkitems when the team HAS customized columns.
  const itemsResult = columnsResult
    ? unwrap(
        await tryFetch('taskboardworkitems', () =>
          getTaskboardWorkItems(projectId, teamId, iterationId),
        ),
        isColumnsNotCustomizedError,
      )
    : null;
  log('taskboard items', {
    attempted: !!columnsResult,
    hasItems: !!itemsResult,
    itemCount: itemsResult?.value.length,
  });

  const { ids: safeIds, dropped } = collectSafeIds(
    relationsData.workItemRelations,
    itemsResult ? itemsResult.value : null,
  );
  if (dropped > 0) {
    log('dropped invalid work-item ids from batch', {
      total: safeIds.length + dropped,
      kept: safeIds.length,
      dropped,
    });
  }
  log('fetching work items', { count: safeIds.length });
  const workItems = await getWorkItemsBatch(projectId, safeIds);
  log('work items fetched', { count: workItems.length });

  let columns: AdoTaskboardColumn[];
  let taskboardItems: AdoTaskboardWorkItem[];
  let columnsFallback = false;

  if (itemsResult && columnsResult) {
    // itemsResult is only fetched when columnsResult is truthy, so the pair
    // travel together. No need for a column-derivation fallback here.
    taskboardItems = itemsResult.value;
    columns = columnsResult.columns;
  } else {
    // No authoritative taskboard items — synthesize from Task type state categories.
    columnsFallback = true;
    log('full synthesis path — fetching Task work-item-type');
    const taskType = await getWorkItemType(projectId, 'Task');
    const synth = synthesizeFromWorkItemType(taskType);
    columns = synth.columns;
    const cardTypes = new Set(['Task']);
    taskboardItems = synthesizeItemsFromWorkItems(
      workItems,
      columns,
      synth.stateToColumnId,
      cardTypes,
    );
    log('synthesis complete', {
      columns: columns.map((c) => c.name),
      itemCount: taskboardItems.length,
    });
  }

  // Subtasks are NOT sorted client-side. composeBoardData preserves the order
  // ADO returned (from /iterations/{id}/workitems for hierarchy,
  // /taskboardworkitems for customized boards) — that order already reflects
  // ADO's StackRank, which is the source of truth the user reorders against.
  const data = composeBoardData({
    relations: relationsData.workItemRelations,
    taskboardItems,
    workItems,
    columns,
    columnsFallback,
  });
  log('loadTaskboard done', {
    columns: data.columns.length,
    swimlanes: data.swimlanes.length,
    unparented: data.unparented.length,
    cards: taskboardItems.length,
  });
  return data;
}

export function useTaskboard() {
  const projectId = useSettings((s) => s.projectId);
  const teamId = useSettings((s) => s.teamId);
  const iteration = useCurrentIteration();
  const iterationId = iteration.data?.id;

  const board = useQuery({
    queryKey: ['taskboard', projectId, teamId, iterationId],
    queryFn: () => loadTaskboard(projectId!, teamId!, iterationId!),
    enabled: !!projectId && !!teamId && !!iterationId,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    retry: false,
  });

  return {
    iteration: iteration.data,
    iterationLoading: iteration.isLoading,
    iterationError: iteration.error,
    board: board.data,
    boardLoading: board.isLoading,
    boardError: board.error,
    refetch: board.refetch,
    isFetching: iteration.isFetching || board.isFetching,
  };
}
