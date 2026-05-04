import { describe, expect, it } from 'vitest';
import {
  collectSafeIds,
  composeBoardData,
  synthesizeFromWorkItemType,
  synthesizeItemsFromWorkItems,
} from './taskboard.helpers';
import type {
  AdoIterationWorkItemRelation,
  AdoTaskboardColumn,
  AdoTaskboardWorkItem,
  AdoWorkItem,
  AdoWorkItemType,
} from '@/ado/types';

// ---- fixture builders -----------------------------------------------------
// Tiny helpers so the tests below read as data, not setup. None of these
// return defaults that drive behavior under test — every meaningful field is
// supplied per case.

function workItem(id: number, type: string, state: string, title = `WI-${id}`): AdoWorkItem {
  return {
    id,
    rev: 1,
    url: `https://dev.azure.com/x/_apis/wit/workItems/${id}`,
    fields: {
      'System.Id': id,
      'System.Title': title,
      'System.State': state,
      'System.WorkItemType': type,
    },
  };
}

function tbItem(id: number, columnId: string, columnName: string, state: string): AdoTaskboardWorkItem {
  return { workItemId: id, state, column: columnName, columnId };
}

function relParent(parentId: number, childId: number): AdoIterationWorkItemRelation {
  return { rel: 'System.LinkTypes.Hierarchy-Forward', source: { id: parentId }, target: { id: childId } };
}

function relRoot(id: number): AdoIterationWorkItemRelation {
  return { rel: null, source: null, target: { id } };
}

// ---------------------------------------------------------------------------

describe('synthesizeFromWorkItemType', () => {
  it('drops Removed states and orders by category (Proposed → InProgress → Resolved → Completed)', () => {
    const taskType: AdoWorkItemType = {
      name: 'Task',
      referenceName: 'Microsoft.VSTS.WorkItemTypes.Task',
      states: [
        { name: 'Done', color: '', category: 'Completed' },
        { name: 'In Progress', color: '', category: 'InProgress' },
        { name: 'Removed', color: '', category: 'Removed' },
        { name: 'To Do', color: '', category: 'Proposed' },
        { name: 'Code Review', color: '', category: 'Resolved' },
      ],
    };

    const { columns, stateToColumnId } = synthesizeFromWorkItemType(taskType);

    expect(columns.map((c) => c.name)).toEqual([
      'To Do',
      'In Progress',
      'Code Review',
      'Done',
    ]);
    expect(columns.every((c) => c.id.startsWith('state-'))).toBe(true);
    expect(columns.every((c) => c.mappings.Task === c.name)).toBe(true);
    expect(stateToColumnId.get('To Do')).toBe('state-To Do');
    expect(stateToColumnId.has('Removed')).toBe(false);
  });

  it('breaks category ties by API order so two InProgress states keep their original sequence', () => {
    const taskType: AdoWorkItemType = {
      name: 'Task',
      referenceName: 'r',
      states: [
        { name: 'Doing', color: '', category: 'InProgress' },
        { name: 'Reviewing', color: '', category: 'InProgress' },
        { name: 'New', color: '', category: 'Proposed' },
      ],
    };
    const { columns } = synthesizeFromWorkItemType(taskType);
    expect(columns.map((c) => c.name)).toEqual(['New', 'Doing', 'Reviewing']);
  });

  it('places unknown categories last (fallback ordering rank)', () => {
    const taskType: AdoWorkItemType = {
      name: 'Task',
      referenceName: 'r',
      // `category` is typed as the known union, but real ADO orgs sometimes
      // return custom category strings. Cast to surface the intended check.
      states: [
        { name: 'Mystery', color: '', category: 'Custom' as unknown as 'Proposed' },
        { name: 'New', color: '', category: 'Proposed' },
        { name: 'Done', color: '', category: 'Completed' },
      ],
    };
    const { columns } = synthesizeFromWorkItemType(taskType);
    expect(columns.map((c) => c.name)).toEqual(['New', 'Done', 'Mystery']);
  });
});

describe('synthesizeItemsFromWorkItems', () => {
  const columns: AdoTaskboardColumn[] = [
    { id: 'state-To Do', name: 'To Do', mappings: { Task: 'To Do' } },
    { id: 'state-Done', name: 'Done', mappings: { Task: 'Done' } },
  ];
  const stateMap = new Map([
    ['To Do', 'state-To Do'],
    ['Done', 'state-Done'],
  ]);

  it('keeps work items whose type is in cardTypes and whose state is mapped', () => {
    const items = synthesizeItemsFromWorkItems(
      [workItem(1, 'Task', 'To Do'), workItem(2, 'Task', 'Done')],
      columns,
      stateMap,
      new Set(['Task']),
    );
    expect(items).toEqual([
      { workItemId: 1, state: 'To Do', column: 'To Do', columnId: 'state-To Do' },
      { workItemId: 2, state: 'Done', column: 'Done', columnId: 'state-Done' },
    ]);
  });

  it('skips items whose type is not in cardTypes (e.g. parent rows)', () => {
    const items = synthesizeItemsFromWorkItems(
      [workItem(1, 'Bug', 'To Do'), workItem(2, 'Task', 'To Do')],
      columns,
      stateMap,
      new Set(['Task']),
    );
    expect(items.map((i) => i.workItemId)).toEqual([2]);
  });

  it('skips items whose state has no column mapping', () => {
    const items = synthesizeItemsFromWorkItems(
      [workItem(1, 'Task', 'In Progress')],
      columns,
      stateMap,
      new Set(['Task']),
    );
    expect(items).toEqual([]);
  });
});

describe('collectSafeIds', () => {
  it('unions ids from relation sources, targets, and taskboard items, deduped', () => {
    const relations: AdoIterationWorkItemRelation[] = [
      relParent(10, 1),
      relParent(10, 2),
      relRoot(20),
    ];
    const tb = [tbItem(1, 'c1', 'A', 'A'), tbItem(3, 'c1', 'A', 'A')];
    const { ids, dropped } = collectSafeIds(relations, tb);
    expect(new Set(ids)).toEqual(new Set([10, 1, 2, 20, 3]));
    expect(dropped).toBe(0);
  });

  it('drops null/non-finite ids and reports them in `dropped`', () => {
    // Cast — ADO emits null target.id in real responses despite the typed shape.
    const relations: AdoIterationWorkItemRelation[] = [
      { rel: null, source: null, target: { id: null as unknown as number } },
      relParent(10, 5),
      { rel: 'r', source: { id: null as unknown as number }, target: { id: 6 } },
    ];
    const { ids, dropped } = collectSafeIds(relations, null);
    expect(new Set(ids)).toEqual(new Set([10, 5, 6]));
    expect(dropped).toBe(1);
  });

  it('handles a null taskboardItems argument (synthesis path)', () => {
    const { ids } = collectSafeIds([relParent(10, 1)], null);
    expect(new Set(ids)).toEqual(new Set([10, 1]));
  });
});

describe('composeBoardData', () => {
  const columns: AdoTaskboardColumn[] = [
    { id: 'col-todo', name: 'To Do', mappings: { Task: 'To Do' } },
    { id: 'col-done', name: 'Done', mappings: { Task: 'Done' } },
  ];

  it('groups child cards under their parent row, preserving relation order', () => {
    const relations = [
      relParent(100, 1),
      relParent(100, 2),
      relParent(200, 3),
    ];
    const tb = [
      tbItem(1, 'col-todo', 'To Do', 'To Do'),
      tbItem(2, 'col-done', 'Done', 'Done'),
      tbItem(3, 'col-todo', 'To Do', 'To Do'),
    ];
    const wis = [
      workItem(100, 'Story', 'Active', 'Story Alpha'),
      workItem(200, 'Story', 'Active', 'Story Beta'),
      workItem(1, 'Task', 'To Do'),
      workItem(2, 'Task', 'Done'),
      workItem(3, 'Task', 'To Do'),
    ];

    const data = composeBoardData({
      relations,
      taskboardItems: tb,
      workItems: wis,
      columns,
      columnsFallback: false,
    });

    expect(data.swimlanes.map((s) => s.row.id)).toEqual([100, 200]);
    expect(data.swimlanes[0].tasks.map((t) => t.workItem.id)).toEqual([1, 2]);
    expect(data.swimlanes[1].tasks.map((t) => t.workItem.id)).toEqual([3]);
    expect(data.unparented).toEqual([]);
    expect(data.totals).toEqual({ cards: 3, swimlanes: 2 });
    expect(data.columns).toBe(columns);
    expect(data.columnsFallback).toBe(false);
  });

  it('puts cards whose parent is missing from the work-item map into `unparented`', () => {
    const relations = [
      // Parent 999 is referenced but not present in workItems — its child becomes unparented.
      relParent(999, 7),
      relParent(100, 8),
    ];
    const tb = [
      tbItem(7, 'col-todo', 'To Do', 'To Do'),
      tbItem(8, 'col-todo', 'To Do', 'To Do'),
    ];
    const wis = [
      workItem(100, 'Story', 'Active'),
      workItem(7, 'Task', 'To Do'),
      workItem(8, 'Task', 'To Do'),
    ];

    const data = composeBoardData({
      relations,
      taskboardItems: tb,
      workItems: wis,
      columns,
      columnsFallback: false,
    });

    expect(data.swimlanes.map((s) => s.row.id)).toEqual([100]);
    expect(data.swimlanes[0].tasks.map((t) => t.workItem.id)).toEqual([8]);
    expect(data.unparented.map((t) => t.workItem.id)).toEqual([7]);
    expect(data.totals).toEqual({ cards: 2, swimlanes: 2 }); // +1 swimlane for the unparented row
  });

  it('treats source-null root relations as childless lanes when the row is in the work-item map and not a card', () => {
    const relations = [
      relRoot(50), // a Bug with no Tasks — appears as its own lane
      relParent(100, 1),
    ];
    const tb = [tbItem(1, 'col-todo', 'To Do', 'To Do')];
    const wis = [
      workItem(50, 'Bug', 'New'),
      workItem(100, 'Story', 'Active'),
      workItem(1, 'Task', 'To Do'),
    ];

    const data = composeBoardData({
      relations,
      taskboardItems: tb,
      workItems: wis,
      columns,
      columnsFallback: false,
    });

    expect(data.swimlanes.map((s) => s.row.id)).toEqual([50, 100]);
    expect(data.swimlanes[0].tasks).toEqual([]); // Bug lane has no children
    expect(data.swimlanes[1].tasks.map((t) => t.workItem.id)).toEqual([1]);
  });

  it('does NOT treat a source-null relation as its own lane when its target is itself a card', () => {
    // ADO emits both `root → Task` and `Story → Task` relations in some sprints.
    // The Task should NOT show up as a lane of its own.
    const relations = [
      relRoot(1),
      relParent(100, 1),
    ];
    const tb = [tbItem(1, 'col-todo', 'To Do', 'To Do')];
    const wis = [workItem(100, 'Story', 'Active'), workItem(1, 'Task', 'To Do')];
    const data = composeBoardData({
      relations,
      taskboardItems: tb,
      workItems: wis,
      columns,
      columnsFallback: false,
    });
    expect(data.swimlanes.map((s) => s.row.id)).toEqual([100]);
    expect(data.unparented).toEqual([]);
  });

  it('preserves first-seen relation order for swimlanes (StackRank coming from ADO)', () => {
    const relations = [
      relParent(300, 31),
      relParent(100, 11),
      relParent(200, 21),
    ];
    const tb = [
      tbItem(31, 'col-todo', 'To Do', 'To Do'),
      tbItem(11, 'col-todo', 'To Do', 'To Do'),
      tbItem(21, 'col-todo', 'To Do', 'To Do'),
    ];
    const wis = [
      workItem(300, 'Story', 'A'),
      workItem(100, 'Story', 'A'),
      workItem(200, 'Story', 'A'),
      workItem(11, 'Task', 'To Do'),
      workItem(21, 'Task', 'To Do'),
      workItem(31, 'Task', 'To Do'),
    ];
    const data = composeBoardData({
      relations,
      taskboardItems: tb,
      workItems: wis,
      columns,
      columnsFallback: false,
    });
    expect(data.swimlanes.map((s) => s.row.id)).toEqual([300, 100, 200]);
  });

  it('drops non-finite ids in source/target ids without crashing', () => {
    const relations: AdoIterationWorkItemRelation[] = [
      { rel: 'r', source: { id: null as unknown as number }, target: { id: 1 } },
      { rel: null, source: null, target: { id: null as unknown as number } },
      relParent(100, 1),
    ];
    const tb = [tbItem(1, 'col-todo', 'To Do', 'To Do')];
    const wis = [workItem(100, 'Story', 'A'), workItem(1, 'Task', 'To Do')];

    const data = composeBoardData({
      relations,
      taskboardItems: tb,
      workItems: wis,
      columns,
      columnsFallback: false,
    });

    expect(data.swimlanes.map((s) => s.row.id)).toEqual([100]);
    expect(data.unparented).toEqual([]);
  });

  it('passes through columnsFallback flag', () => {
    const data = composeBoardData({
      relations: [],
      taskboardItems: [],
      workItems: [],
      columns,
      columnsFallback: true,
    });
    expect(data.columnsFallback).toBe(true);
    expect(data.totals).toEqual({ cards: 0, swimlanes: 0 });
  });
});
