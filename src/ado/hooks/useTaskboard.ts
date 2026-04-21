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
  AdoWorkItemType,
} from '@/ado/types';
import { useSettings } from '@/state/settings.store';
import { useCurrentIteration } from './useCurrentIteration';

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
  console.debug('[jirafied]', ...args);
}

/**
 * Default swimlane order until the user can drag-reorder (Phase 5+).
 * Lower priority = higher on the board. Bugs end up at the bottom, Stories
 * and PBIs at the top; unknown types slot in the middle alongside Tasks.
 */
const ROW_TYPE_PRIORITY: Record<string, number> = {
  Feature: 0,
  Epic: 1,
  'User Story': 2,
  'Product Backlog Item': 2,
  Issue: 2,
  Requirement: 2,
  Task: 3,
  Bug: 4,
};

function compareRows(a: AdoWorkItem, b: AdoWorkItem): number {
  const pa = ROW_TYPE_PRIORITY[a.fields['System.WorkItemType']] ?? 3;
  const pb = ROW_TYPE_PRIORITY[b.fields['System.WorkItemType']] ?? 3;
  if (pa !== pb) return pa - pb;
  return a.fields['System.Title'].localeCompare(b.fields['System.Title'], undefined, {
    sensitivity: 'base',
  });
}

function compareTasks(a: TaskOnBoard, b: TaskOnBoard): number {
  return a.workItem.fields['System.Title'].localeCompare(
    b.workItem.fields['System.Title'],
    undefined,
    { sensitivity: 'base' },
  );
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

const COLUMN_ORDER_HINTS: Record<string, number> = {
  'to do': 0,
  new: 0,
  proposed: 0,
  open: 0,
  approved: 0,
  backlog: 0,
  ready: 0,
  'in progress': 10,
  active: 10,
  doing: 10,
  committed: 10,
  started: 10,
  'in review': 20,
  'to review': 20,
  review: 20,
  'code review': 20,
  'in testing': 30,
  testing: 30,
  'ready for test': 30,
  'ready to test': 30,
  resolved: 40,
  done: 90,
  closed: 90,
  completed: 90,
};

function columnOrderHint(name: string): number {
  return COLUMN_ORDER_HINTS[name.trim().toLowerCase()] ?? 50;
}

function deriveColumnsFromItems(items: AdoTaskboardWorkItem[]): AdoTaskboardColumn[] {
  const byId = new Map<string, { name: string; sampleStates: Map<string, string> }>();
  for (const it of items) {
    let entry = byId.get(it.columnId);
    if (!entry) {
      entry = { name: it.column, sampleStates: new Map() };
      byId.set(it.columnId, entry);
    }
    entry.sampleStates.set(it.workItemType, it.state);
  }
  const cols = [...byId.entries()].map(([id, { name, sampleStates }]) => ({
    id,
    name,
    mappings: Object.fromEntries(sampleStates),
  }));
  cols.sort((a, b) => {
    const diff = columnOrderHint(a.name) - columnOrderHint(b.name);
    return diff !== 0 ? diff : a.name.localeCompare(b.name);
  });
  return cols;
}

/** One column per non-Removed state — matches what native ADO renders when the team
 *  has not customized taskboard columns. Category gives the primary sort order so
 *  Proposed (To Do) comes before InProgress before Resolved before Completed (Done). */
function synthesizeFromWorkItemType(taskType: AdoWorkItemType): {
  columns: AdoTaskboardColumn[];
  stateToColumnId: Map<string, string>;
} {
  const CATEGORY_ORDER: Record<string, number> = {
    Proposed: 0,
    InProgress: 1,
    Resolved: 2,
    Completed: 3,
  };
  const visible = taskType.states.filter((s) => s.category !== 'Removed');
  // Remember the original API order to break ties within a category.
  const apiIndex = new Map(visible.map((s, i) => [s.name, i]));

  const columns: AdoTaskboardColumn[] = visible.map((s) => ({
    id: `state-${s.name}`,
    name: s.name,
    mappings: { Task: s.name },
  }));
  columns.sort((a, b) => {
    const sa = visible.find((s) => s.name === a.name)!;
    const sb = visible.find((s) => s.name === b.name)!;
    const diff = (CATEGORY_ORDER[sa.category] ?? 99) - (CATEGORY_ORDER[sb.category] ?? 99);
    return diff !== 0 ? diff : apiIndex.get(a.name)! - apiIndex.get(b.name)!;
  });

  const stateToColumnId = new Map<string, string>();
  for (const s of visible) stateToColumnId.set(s.name, `state-${s.name}`);
  return { columns, stateToColumnId };
}

function synthesizeItemsFromWorkItems(
  workItems: AdoWorkItem[],
  columns: AdoTaskboardColumn[],
  stateToColumnId: Map<string, string>,
  cardTypes: Set<string>,
): AdoTaskboardWorkItem[] {
  const colName = new Map(columns.map((c) => [c.id, c.name]));
  const out: AdoTaskboardWorkItem[] = [];
  for (const wi of workItems) {
    const type = wi.fields['System.WorkItemType'];
    if (!cardTypes.has(type)) continue;
    const state = wi.fields['System.State'];
    const columnId = stateToColumnId.get(state);
    if (!columnId) continue;
    out.push({
      id: wi.id,
      workItemType: type,
      state,
      column: colName.get(columnId) ?? '',
      columnId,
      order: (wi.fields['Microsoft.VSTS.Common.StackRank'] as number | undefined) ?? wi.id,
    });
  }
  return out;
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

  const ids = new Set<number>();
  for (const r of relationsData.workItemRelations) {
    ids.add(r.target.id);
    if (r.source) ids.add(r.source.id);
  }
  if (itemsResult) for (const t of itemsResult.value) ids.add(t.id);

  log('fetching work items', { count: ids.size });
  const workItems = await getWorkItemsBatch(projectId, [...ids]);
  log('work items fetched', { count: workItems.length });

  let columns: AdoTaskboardColumn[];
  let taskboardItems: AdoTaskboardWorkItem[];
  let columnsFallback = false;

  if (itemsResult) {
    taskboardItems = itemsResult.value;
    if (columnsResult) {
      columns = columnsResult.columns;
    } else {
      columns = deriveColumnsFromItems(itemsResult.value);
      columnsFallback = true;
      log('columns derived from items', { columns: columns.map((c) => c.name) });
    }
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

  const byId = new Map<number, AdoWorkItem>();
  for (const wi of workItems) byId.set(wi.id, wi);

  const parentOf = new Map<number, number>();
  const childrenByParent = new Map<number, Set<number>>();
  for (const r of relationsData.workItemRelations) {
    if (!r.source) continue;
    parentOf.set(r.target.id, r.source.id);
    const children = childrenByParent.get(r.source.id) ?? new Set<number>();
    children.add(r.target.id);
    childrenByParent.set(r.source.id, children);
  }

  const cardsById = new Map<number, AdoTaskboardWorkItem>();
  for (const t of taskboardItems) cardsById.set(t.id, t);

  const rowIdSet = new Set<number>();
  const unparentedIds: number[] = [];
  for (const card of taskboardItems) {
    const parentId = parentOf.get(card.id);
    if (parentId != null && byId.has(parentId)) rowIdSet.add(parentId);
    else unparentedIds.push(card.id);
  }

  const rowWorkItems = [...rowIdSet]
    .map((id) => byId.get(id))
    .filter((x): x is AdoWorkItem => x != null)
    .sort(compareRows);

  const toTask = (id: number): TaskOnBoard | null => {
    const tb = cardsById.get(id);
    const wi = byId.get(id);
    if (!tb || !wi) return null;
    return { taskboard: tb, workItem: wi };
  };

  const swimlanes: Swimlane[] = rowWorkItems.map((row) => {
    const childIds = [...(childrenByParent.get(row.id) ?? [])];
    const tasks = childIds
      .map(toTask)
      .filter((x): x is TaskOnBoard => x != null)
      .sort(compareTasks);
    return { row, tasks };
  });

  const unparented = unparentedIds
    .map(toTask)
    .filter((x): x is TaskOnBoard => x != null)
    .sort(compareTasks);

  const data: TaskboardData = {
    columns,
    swimlanes,
    unparented,
    totals: {
      cards: taskboardItems.length,
      swimlanes: swimlanes.length + (unparented.length > 0 ? 1 : 0),
    },
    columnsFallback,
  };
  log('loadTaskboard done', {
    columns: columns.length,
    swimlanes: swimlanes.length,
    unparented: unparented.length,
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
