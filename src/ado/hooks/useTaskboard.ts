import { useQuery } from '@tanstack/react-query';
import {
  getIterationWorkItems,
  getTaskboardColumns,
  getTaskboardWorkItems,
  getWorkItemsBatch,
} from '@/ado/endpoints';
import type {
  AdoTaskboardColumn,
  AdoTaskboardWorkItem,
  AdoWorkItem,
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
}

async function loadTaskboard(
  projectId: string,
  teamId: string,
  iterationId: string,
): Promise<TaskboardData> {
  const [relations, columnsRes, taskboardItems] = await Promise.all([
    getIterationWorkItems(projectId, teamId, iterationId),
    getTaskboardColumns(projectId, teamId),
    getTaskboardWorkItems(projectId, teamId, iterationId),
  ]);

  const ids = new Set<number>();
  for (const r of relations.workItemRelations) {
    ids.add(r.target.id);
    if (r.source) ids.add(r.source.id);
  }
  for (const t of taskboardItems.value) ids.add(t.id);

  const workItems = await getWorkItemsBatch(projectId, [...ids]);
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
  for (const t of taskboardItems.value) cardsById.set(t.id, t);

  const rowIdSet = new Set<number>();
  const unparentedIds: number[] = [];
  for (const card of taskboardItems.value) {
    const parentId = parentOf.get(card.id);
    if (parentId != null && byId.has(parentId)) {
      rowIdSet.add(parentId);
    } else {
      unparentedIds.push(card.id);
    }
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
    columns: columnsRes.columns,
    swimlanes,
    unparented,
    totals: {
      cards: taskboardItems.value.length,
      swimlanes: swimlanes.length + (unparented.length > 0 ? 1 : 0),
    },
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
