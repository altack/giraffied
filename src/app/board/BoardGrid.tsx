import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { Check } from 'lucide-react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Swimlane, TaskboardData, TaskOnBoard } from '@/ado/hooks/useTaskboard';
import type { AdoIdentity, AdoTaskboardColumn } from '@/ado/types';
import {
  patchWorkItemField,
  reorderIterationWorkItems,
} from '@/ado/endpoints';
import { useSettings } from '@/state/settings.store';
import { laneContextKey, useCollapsedLanes } from '@/state/collapsedLanes.store';
import { cn } from '@/lib/cn';
import { CreateTaskDialog, appendCreatedTask } from './CreateTaskDialog';
import { TaskCard } from './TaskCard';
import { SwimlaneBanner, UnparentedBanner } from './SwimlaneHeader';
import { WorkItemModal } from './WorkItemModal';
import { assigneeKey } from './assigneesOnBoard';
import { laneHueRgb, readPoints } from './workItemVisuals';

const UNPARENTED_LANE_KEY = 'unparented';

interface Row {
  key: string;
  /** Stable id used in droppable IDs and drop-scoping type. */
  laneKey: string;
  /** Parent work-item id for the ADO reorder call. 0 when the lane is "Everything else". */
  parentId: number;
  /** RGB triplet exposed as `--lane-hue` on the lane wrapper — lets the banner
   *  and each column cell share the same color thread at low alpha. */
  hue: string;
  banner: (props: { collapsed: boolean; onToggle: () => void }) => ReactNode;
  tasks: TaskOnBoard[];
}

function isDoneColumn(name: string): boolean {
  return /^(done|closed|completed|resolved)$/i.test(name.trim());
}

function droppableIdFor(laneKey: string, columnId: string): string {
  return `${laneKey}__${columnId}`;
}

function parseDroppableId(id: string): { laneKey: string; columnId: string } | null {
  const idx = id.indexOf('__');
  if (idx < 0) return null;
  return { laneKey: id.slice(0, idx), columnId: id.slice(idx + 2) };
}

function draggableIdFor(workItemId: number): string {
  return `task-${workItemId}`;
}

function parseDraggableId(id: string): number | null {
  const n = Number(id.replace(/^task-/, ''));
  return Number.isFinite(n) ? n : null;
}

export function BoardGrid({
  data,
  iterationId,
  iterationPath,
  assignees,
  assigneeFilter,
}: {
  data: TaskboardData;
  iterationId: string;
  iterationPath: string;
  assignees: AdoIdentity[];
  assigneeFilter: string | null;
}) {
  // Local overlay shadows `data` during the drop animation window. We update it
  // synchronously via flushSync so the library reads the post-drop DOM correctly
  // (see the long comment in handleDragEnd). Once the mutation settles we clear
  // the overlay and the query cache takes over again.
  const [overlay, setOverlay] = useState<TaskboardData | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // `null` = dialog closed. Number = parent lane id. `0` sentinel = unparented.
  // We distinguish "unparented" from "null/closed" by using a separate flag so
  // the dialog's `defaultParentId` can be `null` without being mistaken for closed.
  const [createFor, setCreateFor] = useState<{ parentId: number | null } | null>(null);
  const baseData = overlay ?? data;

  // Apply the assignee filter as a view-only projection. A lane is included
  // when the parent matches OR any child matches; children are only kept if
  // they match. Unparented cards are filtered directly. Drag is disabled
  // while filtered (see `isFiltered` below) — destination.index would be
  // relative to the filtered subset and wouldn't map cleanly to the full
  // task array the reorder call needs.
  const isFiltered = assigneeFilter != null;
  const displayData = useMemo<TaskboardData>(() => {
    if (!isFiltered) return baseData;
    const match = (identity: AdoIdentity | undefined) =>
      assigneeKey(identity) === assigneeFilter;
    const nextSwimlanes: Swimlane[] = [];
    for (const lane of baseData.swimlanes) {
      const parentMatches = match(lane.row.fields['System.AssignedTo']);
      const keptTasks = lane.tasks.filter((t) =>
        match(t.workItem.fields['System.AssignedTo']),
      );
      if (parentMatches || keptTasks.length > 0) {
        nextSwimlanes.push({ ...lane, tasks: keptTasks });
      }
    }
    const nextUnparented = baseData.unparented.filter((t) =>
      match(t.workItem.fields['System.AssignedTo']),
    );
    return { ...baseData, swimlanes: nextSwimlanes, unparented: nextUnparented };
  }, [baseData, assigneeFilter, isFiltered]);

  const { columns, swimlanes, unparented } = displayData;

  // Resolve the selected task against the UNFILTERED baseData, not the
  // filtered view — otherwise opening a card and then toggling the filter
  // would close the modal whenever the card doesn't match. The useEffect
  // below still auto-closes when a refetch genuinely removes the card.
  const selectedTask = useMemo<TaskOnBoard | null>(() => {
    if (selectedId == null) return null;
    for (const lane of baseData.swimlanes) {
      if (lane.row.id === selectedId) {
        // Swimlane rows (Story/Feature/PBI) are work items that *host* child
        // cards but don't live on the taskboard themselves. We synthesize a
        // TaskOnBoard with an empty taskboard slot so the modal can edit them.
        // The state dropdown will only offer the row's current state unless
        // the columns map its work-item type, which is OK for v1.
        return {
          workItem: lane.row,
          taskboard: {
            workItemId: lane.row.id,
            state: lane.row.fields['System.State'] ?? '',
            column: '',
            columnId: '',
          },
        };
      }
      const t = lane.tasks.find((x) => x.workItem.id === selectedId);
      if (t) return t;
    }
    return baseData.unparented.find((x) => x.workItem.id === selectedId) ?? null;
  }, [selectedId, baseData]);

  // If the selected task disappears (refetch removed it from the sprint), close.
  useEffect(() => {
    if (selectedId != null && !selectedTask) setSelectedId(null);
  }, [selectedId, selectedTask]);

  const org = useSettings((s) => s.org);
  const projectId = useSettings((s) => s.projectId);
  const teamId = useSettings((s) => s.teamId);
  const contextKey = laneContextKey(org, projectId, teamId, iterationId);
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => ['taskboard', projectId, teamId, iterationId],
    [projectId, teamId, iterationId],
  );

  const collapsedArr = useCollapsedLanes((s) =>
    contextKey ? s.byContext[contextKey] : undefined,
  );
  const collapsedSet = useMemo(() => new Set(collapsedArr ?? []), [collapsedArr]);
  const toggleInStore = useCollapsedLanes((s) => s.toggle);

  const toggle = (key: string) => {
    if (!contextKey) return;
    toggleInStore(contextKey, key);
  };

  const rows: Row[] = swimlanes.map((lane) => ({
    key: `lane-${lane.row.id}`,
    laneKey: String(lane.row.id),
    parentId: lane.row.id,
    hue: laneHueRgb(lane.row.fields['System.WorkItemType']),
    banner: ({ collapsed, onToggle }) => (
      <SwimlaneBanner
        row={lane.row}
        totalTasks={lane.tasks.length}
        points={readPoints(lane.row.fields)}
        collapsed={collapsed}
        onToggle={onToggle}
        onOpen={() => setSelectedId(lane.row.id)}
        onCreate={() => setCreateFor({ parentId: lane.row.id })}
      />
    ),
    tasks: lane.tasks,
  }));
  if (unparented.length > 0) {
    rows.push({
      key: 'lane-unparented',
      laneKey: UNPARENTED_LANE_KEY,
      parentId: 0,
      hue: laneHueRgb(undefined),
      banner: ({ collapsed, onToggle }) => (
        <UnparentedBanner
          totalTasks={unparented.length}
          collapsed={collapsed}
          onToggle={onToggle}
          onCreate={() => setCreateFor({ parentId: null })}
        />
      ),
      tasks: unparented,
    });
  }

  // Tracks themselves use minmax(0, 1fr) so a wide card can't push its column
  // past its share. The "no scrollbar until the viewport actually can't fit N
  // reasonable columns" feel comes from minBoardWidth on the container below —
  // not from the track min, which would let content drive overflow.
  const gridTemplateColumns = `repeat(${columns.length}, minmax(0, 1fr))`;
  const minBoardWidth =
    columns.length * 260 + Math.max(0, columns.length - 1) * 12 + 40;

  const reorder = useMutation({
    mutationFn: async (vars: {
      cardId: number;
      prevCardId: number;
      nextCardId: number;
      parentId: number;
      newState?: string;
    }) => {
      if (!projectId || !teamId) throw new Error('Missing project/team');
      if (vars.newState) {
        await patchWorkItemField(projectId, vars.cardId, 'System.State', vars.newState);
      }
      return reorderIterationWorkItems(projectId, teamId, iterationId, {
        ids: [vars.cardId],
        previousId: vars.prevCardId,
        nextId: vars.nextCardId,
        parentId: vars.parentId,
      });
    },
    // No onSuccess: ADO's reorder response has partial order values that would corrupt
    // the cache if merged. The 30s refetch reconciles authoritative order.
    onError: () => {
      queryClient.invalidateQueries({ queryKey });
    },
    onSettled: () => {
      // The cache was updated optimistically alongside the overlay; once the mutation
      // finishes (success or error → invalidate), we can drop the overlay. If the
      // server state diverged from our optimistic guess the cache already reflects that.
      setOverlay(null);
    },
  });

  function handleDragEnd(result: DropResult) {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    ) {
      return;
    }

    const src = parseDroppableId(source.droppableId);
    const dst = parseDroppableId(destination.droppableId);
    if (!src || !dst) return;
    if (src.laneKey !== dst.laneKey) return;

    const cardId = parseDraggableId(draggableId);
    if (cardId == null) return;

    const row = rows.find((r) => r.laneKey === src.laneKey);
    const dstColumn = columns.find((c) => c.id === dst.columnId);
    if (!row || !dstColumn) return;

    const card = row.tasks.find((t) => t.workItem.id === cardId);
    if (!card) return;

    const dstColumnTasks = row.tasks.filter(
      (t) => t.taskboard.columnId === dst.columnId && t.workItem.id !== cardId,
    );
    const prevCard = dstColumnTasks[destination.index - 1];
    const nextCard = dstColumnTasks[destination.index];

    const wiType = card.workItem.fields['System.WorkItemType'];
    const stateChanged = src.columnId !== dst.columnId;
    const newState = stateChanged ? dstColumn.mappings[wiType] : undefined;

    const next = moveCard(displayData, src.laneKey, cardId, {
      columnId: dst.columnId,
      columnName: dstColumn.name,
      destIndex: destination.index,
      state: newState,
    });

    // CRITICAL for drop-animation correctness: hello-pangea/dnd uses FLIP to animate
    // the dropped card from its lifted position to its new "home" in the DOM. It reads
    // layout right after onDragEnd returns. If our state update hasn't committed by then,
    // it measures the pre-drop DOM, animates to the old spot, and we see a flicker as
    // React later commits and the card jumps.
    //
    // `queryClient.setQueryData` can't satisfy this timing: the cache update notifies
    // observers via `useSyncExternalStore`, whose snapshot hop is scheduled, not
    // flushed with the event handler. Wrapping it in flushSync doesn't help — flushSync
    // only forces pending React renders; the external-store notification itself hasn't
    // reached React yet at that point.
    //
    // A local `useState` setter DOES participate in React's sync flush machinery.
    // flushSync around setOverlay guarantees the render lands before onDragEnd returns,
    // so the library measures the new DOM and the drop animation lands where expected.
    flushSync(() => {
      setOverlay(next);
    });
    // Keep the cache in sync too so that if a refetch races with the animation, it
    // doesn't clobber the optimistic position. The cache update can be async —
    // the overlay is what the library is racing against.
    queryClient.setQueryData<TaskboardData>(queryKey, next);

    reorder.mutate({
      cardId,
      prevCardId: prevCard?.workItem.id ?? 0,
      nextCardId: nextCard?.workItem.id ?? 0,
      parentId: row.parentId,
      newState,
    });
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex-1 overflow-auto">
        <div className="px-5 pt-3 pb-6 space-y-3" style={{ minWidth: minBoardWidth }}>
          <div className="sticky top-0 z-20 -mx-5 px-5 py-2 bg-[var(--color-canvas)]/75 backdrop-blur-lg border-b border-white/[0.05]">
            <div className="grid gap-3" style={{ gridTemplateColumns }}>
              {columns.map((col) => (
                <ColumnHeader
                  key={col.id}
                  column={col}
                  count={rows.reduce(
                    (n, r) => n + r.tasks.filter((t) => t.taskboard.columnId === col.id).length,
                    0,
                  )}
                />
              ))}
            </div>
          </div>

          {rows.map((row) => {
            const isCollapsed = collapsedSet.has(row.key);
            // --lane-hue inherits to the banner and column cells below, so both
            // can reference the same rgb() triplet at low alpha. The wrapper
            // owns the intra-lane 12px spacing; the outer space-y-3 handles
            // between-lane spacing.
            return (
              <div
                key={row.key}
                className="space-y-3"
                style={{ '--lane-hue': row.hue } as CSSProperties}
              >
                {row.banner({ collapsed: isCollapsed, onToggle: () => toggle(row.key) })}
                {!isCollapsed && (
                  <div className="grid gap-3" style={{ gridTemplateColumns }}>
                    {columns.map((col) => (
                      <ColumnCell
                        key={col.id}
                        droppableId={droppableIdFor(row.laneKey, col.id)}
                        type={`lane-${row.laneKey}`}
                        tasks={row.tasks.filter((t) => t.taskboard.columnId === col.id)}
                        onOpen={(t) => setSelectedId(t.workItem.id)}
                        dragDisabled={isFiltered}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {selectedTask && (
        <WorkItemModal
          key={selectedTask.workItem.id}
          task={selectedTask}
          columns={columns}
          open
          onClose={() => setSelectedId(null)}
          iterationId={iterationId}
          boardAssignees={assignees}
        />
      )}
      {createFor && (
        <CreateTaskDialog
          // Key on parentId so switching lanes via the dropdown doesn't keep a
          // stale draft; closing + reopening on a different lane remounts.
          key={createFor.parentId ?? 'unparented'}
          open
          onClose={() => setCreateFor(null)}
          defaultParentId={createFor.parentId}
          swimlanes={baseData.swimlanes}
          iterationPath={iterationPath}
          boardAssignees={assignees}
          onCreated={(created, parentId) => {
            queryClient.setQueryData<TaskboardData>(queryKey, (prev) =>
              prev ? appendCreatedTask(prev, created, parentId) : prev,
            );
          }}
        />
      )}
    </DragDropContext>
  );
}

function ColumnHeader({ column, count }: { column: AdoTaskboardColumn; count: number }) {
  const done = isDoneColumn(column.name);
  return (
    <div className="flex items-center gap-2 px-1">
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] pl-1 text-zinc-400">
        {column.name}
      </span>
      <span className="mono text-[11px] text-zinc-600">{count}</span>
      {done && count > 0 && <Check className="h-3 w-3 text-emerald-400/80 ml-auto" />}
    </div>
  );
}

function ColumnCell({
  droppableId,
  type,
  tasks,
  onOpen,
  dragDisabled,
}: {
  droppableId: string;
  type: string;
  tasks: TaskOnBoard[];
  onOpen: (task: TaskOnBoard) => void;
  dragDisabled: boolean;
}) {
  return (
    <Droppable droppableId={droppableId} type={type} isDropDisabled={dragDisabled}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          className={cn(
            'rounded-lg border p-1.5 space-y-1.5 min-h-[96px] transition-colors duration-100',
            snapshot.isDraggingOver
              ? 'bg-indigo-400/[0.05] border-indigo-400/25'
              : 'border-white/[0.04]',
          )}
          // At rest, each cell gets a gentle top-to-bottom bleed of the
          // inherited --lane-hue — the horizontal "lane thread" that ties the
          // row together. Dragover takes over with its own indigo fill (a
          // cross-cutting action signal), so we skip the gradient there.
          style={
            snapshot.isDraggingOver
              ? undefined
              : {
                  backgroundImage:
                    'linear-gradient(180deg, rgb(var(--lane-hue) / 0.045), rgb(var(--lane-hue) / 0.012))',
                }
          }
        >
          {tasks.map((t, i) => (
            <Draggable
              key={t.workItem.id}
              draggableId={draggableIdFor(t.workItem.id)}
              index={i}
              isDragDisabled={dragDisabled}
            >
              {(dragProvided, dragSnapshot) => (
                <TaskCard
                  task={t}
                  dragProvided={dragProvided}
                  dragSnapshot={dragSnapshot}
                  onOpen={onOpen}
                  dragDisabled={dragDisabled}
                />
              )}
            </Draggable>
          ))}
          {provided.placeholder}
        </div>
      )}
    </Droppable>
  );
}

/** Move a card within its lane's `tasks` array so that within the destination column
 *  filter it sits at `destIndex`. Also patches the card's columnId/state if changed. */
function moveCard(
  data: TaskboardData,
  laneKey: string,
  cardId: number,
  patch: {
    columnId: string;
    columnName: string;
    destIndex: number;
    state?: string;
  },
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
