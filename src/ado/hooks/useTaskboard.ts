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

/** Server-side check that fires when a team has never saved taskboard-column config
 *  (and sometimes fires spuriously for orgs where the endpoint disagrees with the UI). */
function isColumnsNotCustomizedError(e: unknown): boolean {
  return (
    e instanceof AdoError &&
    e.status === 400 &&
    /columns are not added|customize the taskboard columns/i.test(e.body)
  );
}

/** Sort key for fallback column ordering based on common state names. Unknown → middle. */
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

/** Derive column list from the taskboardworkitems response when the config endpoint refuses. */
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

/** Last-resort synthesis when both taskboard endpoints are unusable. Builds columns from the
 *  Task work-item-type's state categories, the way the native UI does on first use. */
function synthesizeFromWorkItemType(taskType: AdoWorkItemType): {
  columns: AdoTaskboardColumn[];
  stateToColumnId: Map<string, string>;
} {
  const COL = { todo: 'synth-todo', doing: 'synth-doing', done: 'synth-done' };
  const proposed: string[] = [];
  const inProgress: string[] = [];
  const done: string[] = [];
  for (const s of taskType.states) {
    if (s.category === 'Proposed') proposed.push(s.name);
    else if (s.category === 'InProgress') inProgress.push(s.name);
    else if (s.category === 'Resolved' || s.category === 'Completed') done.push(s.name);
  }
  const columns: AdoTaskboardColumn[] = [];
  const stateToColumnId = new Map<string, string>();
  if (proposed.length) {
    columns.push({ id: COL.todo, name: 'To Do', mappings: { Task: proposed[0] } });
    for (const n of proposed) stateToColumnId.set(n, COL.todo);
  }
  if (inProgress.length) {
    columns.push({ id: COL.doing, name: 'In Progress', mappings: { Task: inProgress[0] } });
    for (const n of inProgress) stateToColumnId.set(n, COL.doing);
  }
  if (done.length) {
    columns.push({
      id: COL.done,
      name: 'Done',
      mappings: { Task: done[done.length - 1] },
    });
    for (const n of done) stateToColumnId.set(n, COL.done);
  }
  return { columns, stateToColumnId };
}

function synthesizeItemsFromWorkItems(
  workItems: AdoWorkItem[],
  columns: AdoTaskboardColumn[],
  stateToColumnId: Map<string, string>,
): AdoTaskboardWorkItem[] {
  const colName = new Map(columns.map((c) => [c.id, c.name]));
  const out: AdoTaskboardWorkItem[] = [];
  for (const wi of workItems) {
    if (wi.fields['System.WorkItemType'] !== 'Task') continue;
    const state = wi.fields['System.State'];
    const columnId = stateToColumnId.get(state);
    if (!columnId) continue;
    out.push({
      id: wi.id,
      workItemType: 'Task',
      state,
      column: colName.get(columnId) ?? '',
      columnId,
      order: (wi.fields['Microsoft.VSTS.Common.StackRank'] as number | undefined) ?? wi.id,
    });
  }
  return out;
}

async function loadTaskboard(
  projectId: string,
  teamId: string,
  iterationId: string,
): Promise<TaskboardData> {
  const [relations, columnsResult, itemsResult] = await Promise.all([
    getIterationWorkItems(projectId, teamId, iterationId),
    getTaskboardColumns(projectId, teamId).catch((e: unknown) => {
      if (isColumnsNotCustomizedError(e)) return null;
      throw e;
    }),
    getTaskboardWorkItems(projectId, teamId, iterationId).catch((e: unknown) => {
      if (isColumnsNotCustomizedError(e)) return null;
      throw e;
    }),
  ]);

  const ids = new Set<number>();
  for (const r of relations.workItemRelations) {
    ids.add(r.target.id);
    if (r.source) ids.add(r.source.id);
  }
  if (itemsResult) for (const t of itemsResult.value) ids.add(t.id);

  const workItems = await getWorkItemsBatch(projectId, [...ids]);

  let columns: AdoTaskboardColumn[];
  let taskboardItems: AdoTaskboardWorkItem[];
  let columnsFallback = false;

  if (itemsResult && columnsResult) {
    columns = columnsResult.columns;
    taskboardItems = itemsResult.value;
  } else if (itemsResult && !columnsResult) {
    columns = deriveColumnsFromItems(itemsResult.value);
    taskboardItems = itemsResult.value;
    columnsFallback = true;
  } else {
    const taskType = await getWorkItemType(projectId, 'Task');
    const synth = synthesizeFromWorkItemType(taskType);
    columns = columnsResult ? columnsResult.columns : synth.columns;
    taskboardItems = synthesizeItemsFromWorkItems(workItems, columns, synth.stateToColumnId);
    columnsFallback = !columnsResult;
  }

  const byId = new Map<number, AdoWorkItem>();
  for (const wi of workItems) byId.set(wi.id, wi);

  const parentOf = new Map<number, number>();
  const childrenByParent = new Map<number, Set<number>>();
  for (const r of relations.workItemRelations) {
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
    .sort((a, b) => {
      const sa = (a.fields['Microsoft.VSTS.Common.StackRank'] as number | undefined) ?? Infinity;
      const sb = (b.fields['Microsoft.VSTS.Common.StackRank'] as number | undefined) ?? Infinity;
      if (sa !== sb) return sa - sb;
      return a.id - b.id;
    });

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
      .sort((a, b) => a.taskboard.order - b.taskboard.order);
    return { row, tasks };
  });

  const unparented = unparentedIds
    .map(toTask)
    .filter((x): x is TaskOnBoard => x != null)
    .sort((a, b) => a.taskboard.order - b.taskboard.order);

  return {
    columns,
    swimlanes,
    unparented,
    totals: {
      cards: taskboardItems.length,
      swimlanes: swimlanes.length + (unparented.length > 0 ? 1 : 0),
    },
    columnsFallback,
  };
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
