/**
 * Pure helpers extracted from `useTaskboard` so the data-shaping logic can be
 * unit-tested without mocking TanStack Query, the ADO client, or the hook
 * lifecycle. These functions take only plain data in and return plain data
 * out — no IO, no React, no module-level state.
 *
 * The hook still owns: fetching, parallel orchestration, the
 * "is /taskboardcolumns customized?" decision tree, and synthesis fallback
 * triggering. It composes its final result by calling these helpers.
 */
import type {
  AdoIterationWorkItemRelation,
  AdoTaskboardColumn,
  AdoTaskboardWorkItem,
  AdoWorkItem,
  AdoWorkItemType,
} from '@/ado/types';
import type { Swimlane, TaskboardData, TaskOnBoard } from './useTaskboard';

/** One column per non-Removed state — matches what native ADO renders when the team
 *  has not customized taskboard columns. Category gives the primary sort order so
 *  Proposed (To Do) comes before InProgress before Resolved before Completed (Done). */
export function synthesizeFromWorkItemType(taskType: AdoWorkItemType): {
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

/** Build synthetic taskboard items by mapping each work item's State → columnId.
 *  Skips items whose type isn't in `cardTypes` or whose state has no mapped column. */
export function synthesizeItemsFromWorkItems(
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
      workItemId: wi.id,
      state,
      column: colName.get(columnId) ?? '',
      columnId,
    });
  }
  return out;
}

/** Collect every work-item id referenced by the iteration relations (target + source)
 *  plus any taskboard items, dropping null/non-finite ids. ADO can emit relations with
 *  `target.id: null` when the iteration references a deleted/cross-project item; passing
 *  one of those into /workitemsbatch 400s the whole chunk. */
export function collectSafeIds(
  relations: AdoIterationWorkItemRelation[],
  taskboardItems: AdoTaskboardWorkItem[] | null,
): { ids: number[]; dropped: number } {
  const seen = new Set<number>();
  const all = new Set<unknown>();
  for (const r of relations) {
    all.add(r.target.id);
    if (r.source) all.add(r.source.id);
  }
  if (taskboardItems) for (const t of taskboardItems) all.add(t.workItemId);
  for (const x of all) {
    if (typeof x === 'number' && Number.isFinite(x)) seen.add(x);
  }
  return { ids: [...seen], dropped: all.size - seen.size };
}

/**
 * Build the swimlane structure from raw inputs. This is the core composition
 * logic of `useTaskboard` — given the relations stream, the resolved taskboard
 * items (real or synthesized), the batched work items, and the columns, it
 * groups cards by their parent row and identifies unparented cards.
 *
 * Row order is taken from the order ADO returned in `workItemRelations`
 * (StackRank — first-seen-wins via Set insertion). Subtask order within a
 * lane is preserved from the parent → child traversal.
 */
export function composeBoardData(args: {
  relations: AdoIterationWorkItemRelation[];
  taskboardItems: AdoTaskboardWorkItem[];
  workItems: AdoWorkItem[];
  columns: AdoTaskboardColumn[];
  columnsFallback: boolean;
}): TaskboardData {
  const { relations, taskboardItems, workItems, columns, columnsFallback } = args;

  const byId = new Map<number, AdoWorkItem>();
  for (const wi of workItems) byId.set(wi.id, wi);

  const parentOf = new Map<number, number>();
  const childrenByParent = new Map<number, Set<number>>();
  for (const r of relations) {
    if (!r.source) continue;
    parentOf.set(r.target.id, r.source.id);
    const children = childrenByParent.get(r.source.id) ?? new Set<number>();
    children.add(r.target.id);
    childrenByParent.set(r.source.id, children);
  }

  const cardsById = new Map<number, AdoTaskboardWorkItem>();
  for (const t of taskboardItems) cardsById.set(t.workItemId, t);

  // Build rowIdSet in ADO's returned order. relations is already StackRank-ordered,
  // so first-seen-wins via Set insertion gives us the row order ADO would render.
  // A row is either:
  //   • a parent of any card (appears as `source` of a child relation), or
  //   • a top-level sprint item with no child cards (a `source: null` relation
  //     whose target isn't itself a card — e.g. a Bug with no Tasks).
  const rowIdSet = new Set<number>();
  for (const r of relations) {
    if (r.source == null) {
      const rootId = r.target.id;
      if (typeof rootId !== 'number' || !Number.isFinite(rootId)) continue;
      if (cardsById.has(rootId)) continue;
      if (!byId.has(rootId)) continue;
      rowIdSet.add(rootId);
    } else {
      const parentId = r.source.id;
      if (typeof parentId !== 'number' || !Number.isFinite(parentId)) continue;
      if (!byId.has(parentId)) continue;
      rowIdSet.add(parentId);
    }
  }

  const unparentedIds: number[] = [];
  for (const card of taskboardItems) {
    const parentId = parentOf.get(card.workItemId);
    if (parentId == null || !byId.has(parentId)) {
      unparentedIds.push(card.workItemId);
    }
  }

  const rowWorkItems = [...rowIdSet]
    .map((id) => byId.get(id))
    .filter((x): x is AdoWorkItem => x != null);

  const toTask = (id: number): TaskOnBoard | null => {
    const tb = cardsById.get(id);
    const wi = byId.get(id);
    if (!tb || !wi) return null;
    return { taskboard: tb, workItem: wi };
  };

  const swimlanes: Swimlane[] = rowWorkItems.map((row) => {
    const childIds = [...(childrenByParent.get(row.id) ?? [])];
    const tasks = childIds.map(toTask).filter((x): x is TaskOnBoard => x != null);
    return { row, tasks };
  });

  const unparented = unparentedIds
    .map(toTask)
    .filter((x): x is TaskOnBoard => x != null);

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
