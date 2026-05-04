/**
 * Pure card-reorder math used by the board's drag-and-drop. Lives outside the
 * Board component so it can be unit-tested without spinning up React, the dnd
 * library, or the query cache.
 *
 * `moveCard` returns a new `TaskboardData` with the card moved to the
 * destination column at the given filtered destIndex (the index within the
 * destination column's tasks, NOT the index within the lane's full task list —
 * that's how hello-pangea/dnd reports drop indices).
 */
import type { TaskboardData, TaskOnBoard } from '@/ado/hooks/useTaskboard';

export const UNPARENTED_LANE_KEY = 'unparented';

export interface MoveCardPatch {
  columnId: string;
  columnName: string;
  /** Destination index relative to the *destination column's* tasks (post-removal of the moved card). */
  destIndex: number;
  /** When the move crossed a column boundary, the new System.State value to apply. */
  state?: string;
}

export function moveCard(
  data: TaskboardData,
  laneKey: string,
  cardId: number,
  patch: MoveCardPatch,
): TaskboardData {
  const reorderLane = (tasks: TaskOnBoard[]): TaskOnBoard[] => {
    const idx = tasks.findIndex((t) => t.workItem.id === cardId);
    if (idx < 0) return tasks;

    const card = tasks[idx];
    const moved: TaskOnBoard = {
      ...card,
      taskboard: {
        ...card.taskboard,
        columnId: patch.columnId,
        column: patch.columnName,
        ...(patch.state ? { state: patch.state } : {}),
      },
      workItem: patch.state
        ? {
            ...card.workItem,
            fields: { ...card.workItem.fields, 'System.State': patch.state },
          }
        : card.workItem,
    };

    const without = [...tasks.slice(0, idx), ...tasks.slice(idx + 1)];
    let seen = 0;
    let insertAt = without.length;
    for (let i = 0; i < without.length; i++) {
      if (without[i].taskboard.columnId === patch.columnId) {
        if (seen === patch.destIndex) {
          insertAt = i;
          break;
        }
        seen++;
      }
    }
    return [...without.slice(0, insertAt), moved, ...without.slice(insertAt)];
  };

  if (laneKey === UNPARENTED_LANE_KEY) {
    return { ...data, unparented: reorderLane(data.unparented) };
  }
  const parentId = Number(laneKey);
  return {
    ...data,
    swimlanes: data.swimlanes.map((lane) =>
      lane.row.id === parentId ? { ...lane, tasks: reorderLane(lane.tasks) } : lane,
    ),
  };
}
