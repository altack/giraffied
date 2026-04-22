import type { AdoIdentity } from '@/ado/types';
import type { TaskboardData } from '@/ado/hooks/useTaskboard';

/** Stable key for an assignee identity. `uniqueName` (email-ish) is the most
 *  consistent across ADO endpoints; `id` is sometimes a GUID and sometimes a
 *  descriptor; displayName is last-resort for orgs that don't populate either. */
export function assigneeKey(identity: AdoIdentity | undefined): string | null {
  if (!identity?.displayName) return null;
  return identity.uniqueName ?? identity.id ?? identity.displayName;
}

export interface BoardAssignee {
  key: string;
  identity: AdoIdentity;
  /** Card count across the board — counts the parent when the parent is a
   *  swimlane row, plus every assigned subtask and every unparented card. */
  count: number;
}

/** Unique assignees currently on the board — across child cards, swimlane rows,
 *  and the "Everything else" lane. Sorted by card count desc (most-loaded first),
 *  tiebreak alphabetical. Much more accurate than `/teams/{id}/members`, which
 *  can include retired or unrelated members. */
export function assigneesOnBoard(data: TaskboardData | undefined): BoardAssignee[] {
  if (!data) return [];
  const byKey = new Map<string, BoardAssignee>();
  const collect = (a: AdoIdentity | undefined) => {
    const key = assigneeKey(a);
    if (!key || !a) return;
    const cur = byKey.get(key) ?? { key, identity: a, count: 0 };
    cur.count += 1;
    byKey.set(key, cur);
  };
  for (const lane of data.swimlanes) {
    collect(lane.row.fields['System.AssignedTo']);
    for (const t of lane.tasks) collect(t.workItem.fields['System.AssignedTo']);
  }
  for (const t of data.unparented) collect(t.workItem.fields['System.AssignedTo']);
  return [...byKey.values()].sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    return a.identity.displayName.localeCompare(b.identity.displayName, undefined, {
      sensitivity: 'base',
    });
  });
}
