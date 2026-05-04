import { describe, expect, it } from 'vitest';
import { UNPARENTED_LANE_KEY, moveCard } from './reorder';
import type { TaskboardData, TaskOnBoard } from '@/ado/hooks/useTaskboard';
import type { AdoTaskboardColumn, AdoWorkItem } from '@/ado/types';

// ---- fixture builders -----------------------------------------------------

function task(id: number, columnId: string, columnName: string, state: string): TaskOnBoard {
  const wi: AdoWorkItem = {
    id,
    rev: 1,
    url: '',
    fields: {
      'System.Id': id,
      'System.Title': `Task ${id}`,
      'System.State': state,
      'System.WorkItemType': 'Task',
    },
  };
  return {
    workItem: wi,
    taskboard: { workItemId: id, state, column: columnName, columnId },
  };
}

function rowWorkItem(id: number, type: string): AdoWorkItem {
  return {
    id,
    rev: 1,
    url: '',
    fields: {
      'System.Id': id,
      'System.Title': `Row ${id}`,
      'System.State': 'Active',
      'System.WorkItemType': type,
    },
  };
}

const columns: AdoTaskboardColumn[] = [
  { id: 'todo', name: 'To Do', mappings: { Task: 'To Do' } },
  { id: 'doing', name: 'In Progress', mappings: { Task: 'In Progress' } },
  { id: 'done', name: 'Done', mappings: { Task: 'Done' } },
];

function build(laneTasks: TaskOnBoard[], unparented: TaskOnBoard[] = []): TaskboardData {
  return {
    columns,
    swimlanes: [
      { row: rowWorkItem(100, 'Story'), tasks: laneTasks },
    ],
    unparented,
    totals: {
      cards: laneTasks.length + unparented.length,
      swimlanes: 1 + (unparented.length > 0 ? 1 : 0),
    },
    columnsFallback: false,
  };
}

function ids(tasks: TaskOnBoard[]): number[] {
  return tasks.map((t) => t.workItem.id);
}

// ---------------------------------------------------------------------------

describe('moveCard', () => {
  it('reorders within the same column when destIndex moves the card up', () => {
    // Lane: [A:todo, B:todo, C:todo]. Move C to position 0 (before A).
    const data = build([
      task(1, 'todo', 'To Do', 'To Do'),
      task(2, 'todo', 'To Do', 'To Do'),
      task(3, 'todo', 'To Do', 'To Do'),
    ]);
    const out = moveCard(data, '100', 3, {
      columnId: 'todo',
      columnName: 'To Do',
      destIndex: 0,
    });
    expect(ids(out.swimlanes[0].tasks)).toEqual([3, 1, 2]);
    expect(out.swimlanes[0].tasks[0].taskboard.columnId).toBe('todo');
    // No state change → state untouched.
    expect(out.swimlanes[0].tasks[0].workItem.fields['System.State']).toBe('To Do');
  });

  it('moves a card across columns and patches columnId, column name, and state', () => {
    const data = build([
      task(1, 'todo', 'To Do', 'To Do'),
      task(2, 'doing', 'In Progress', 'In Progress'),
    ]);
    const out = moveCard(data, '100', 1, {
      columnId: 'doing',
      columnName: 'In Progress',
      destIndex: 0,
      state: 'In Progress',
    });
    const moved = out.swimlanes[0].tasks.find((t) => t.workItem.id === 1)!;
    expect(moved.taskboard.columnId).toBe('doing');
    expect(moved.taskboard.column).toBe('In Progress');
    expect(moved.taskboard.state).toBe('In Progress');
    expect(moved.workItem.fields['System.State']).toBe('In Progress');
  });

  it('places the moved card at destIndex *within the destination column filter*, not the lane', () => {
    // Lane: [A:todo, B:doing, C:doing, D:todo].
    // Move A to doing destIndex=1 → A should sit AFTER B and BEFORE C.
    // Final lane order (post-removal then insert): [B, A, C, D].
    const data = build([
      task(1, 'todo', 'To Do', 'To Do'),
      task(2, 'doing', 'In Progress', 'In Progress'),
      task(3, 'doing', 'In Progress', 'In Progress'),
      task(4, 'todo', 'To Do', 'To Do'),
    ]);
    const out = moveCard(data, '100', 1, {
      columnId: 'doing',
      columnName: 'In Progress',
      destIndex: 1,
      state: 'In Progress',
    });
    expect(ids(out.swimlanes[0].tasks)).toEqual([2, 1, 3, 4]);
  });

  it('appends to the end of the destination column when destIndex >= number of cards already there', () => {
    const data = build([
      task(1, 'todo', 'To Do', 'To Do'),
      task(2, 'doing', 'In Progress', 'In Progress'),
      task(3, 'doing', 'In Progress', 'In Progress'),
    ]);
    // Moving 1 to doing column at index 2 (past the 2 cards already there).
    const out = moveCard(data, '100', 1, {
      columnId: 'doing',
      columnName: 'In Progress',
      destIndex: 2,
      state: 'In Progress',
    });
    expect(ids(out.swimlanes[0].tasks)).toEqual([2, 3, 1]);
  });

  it('returns the same lane unchanged when the cardId is not present', () => {
    const data = build([task(1, 'todo', 'To Do', 'To Do')]);
    const out = moveCard(data, '100', 999, {
      columnId: 'doing',
      columnName: 'In Progress',
      destIndex: 0,
      state: 'In Progress',
    });
    expect(out.swimlanes[0].tasks).toBe(data.swimlanes[0].tasks);
  });

  it('targets the unparented bucket when laneKey === UNPARENTED_LANE_KEY', () => {
    const data = build(
      [],
      [
        task(10, 'todo', 'To Do', 'To Do'),
        task(11, 'todo', 'To Do', 'To Do'),
      ],
    );
    const out = moveCard(data, UNPARENTED_LANE_KEY, 11, {
      columnId: 'todo',
      columnName: 'To Do',
      destIndex: 0,
    });
    expect(ids(out.unparented)).toEqual([11, 10]);
    // Other lanes untouched.
    expect(out.swimlanes).toBe(data.swimlanes);
  });

  it('does not mutate the input data — references are preserved for unaffected lanes', () => {
    const otherLane: TaskOnBoard[] = [task(50, 'todo', 'To Do', 'To Do')];
    const data: TaskboardData = {
      columns,
      swimlanes: [
        { row: rowWorkItem(100, 'Story'), tasks: [task(1, 'todo', 'To Do', 'To Do'), task(2, 'todo', 'To Do', 'To Do')] },
        { row: rowWorkItem(200, 'Story'), tasks: otherLane },
      ],
      unparented: [],
      totals: { cards: 3, swimlanes: 2 },
      columnsFallback: false,
    };
    const before = data.swimlanes[0].tasks;
    const out = moveCard(data, '100', 2, {
      columnId: 'todo',
      columnName: 'To Do',
      destIndex: 0,
    });
    expect(out).not.toBe(data);
    expect(out.swimlanes[0].tasks).not.toBe(before);
    // The untouched lane keeps its array reference.
    expect(out.swimlanes[1].tasks).toBe(otherLane);
    // Original data is intact.
    expect(ids(data.swimlanes[0].tasks)).toEqual([1, 2]);
  });
});
