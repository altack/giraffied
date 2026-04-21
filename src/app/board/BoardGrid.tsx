import { Fragment, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import type { TaskboardData, TaskOnBoard } from '@/ado/hooks/useTaskboard';
import type { AdoTaskboardColumn } from '@/ado/types';
import { TaskCard } from './TaskCard';
import { SwimlaneBanner, UnparentedBanner } from './SwimlaneHeader';

interface Row {
  key: string;
  banner: ReactNode;
  tasks: TaskOnBoard[];
}

/**
 * Heuristic for rendering a Done-style check on completed columns. Names the synthesis
 * path emits match native ADO state names (Done / Closed / Completed / Resolved).
 */
function isDoneColumn(name: string): boolean {
  return /^(done|closed|completed|resolved)$/i.test(name.trim());
}

export function BoardGrid({ data }: { data: TaskboardData }) {
  const { columns, swimlanes, unparented } = data;

  const rows: Row[] = swimlanes.map((lane) => ({
    key: `lane-${lane.row.id}`,
    banner: (
      <SwimlaneBanner
        row={lane.row}
        totalTasks={lane.tasks.length}
        points={lane.row.fields['Microsoft.VSTS.Scheduling.StoryPoints']}
      />
    ),
    tasks: lane.tasks,
  }));
  if (unparented.length > 0) {
    rows.push({
      key: 'lane-unparented',
      banner: <UnparentedBanner totalTasks={unparented.length} />,
      tasks: unparented,
    });
  }

  const gridTemplateColumns = `repeat(${columns.length}, minmax(260px, 1fr))`;

  return (
    <div className="flex-1 overflow-auto bg-zinc-950">
      <div className="min-w-max px-4 pt-4 pb-6 space-y-3">
        {/* Column header pills — sticky top, aligned with the cell tracks below */}
        <div
          className="grid gap-3 sticky top-0 z-20 bg-zinc-950 pb-2"
          style={{ gridTemplateColumns }}
        >
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

        {/* Swimlanes — each is a full-width banner + a grid row of column cells */}
        {rows.map((row) => (
          <Fragment key={row.key}>
            {row.banner}
            <div className="grid gap-3" style={{ gridTemplateColumns }}>
              {columns.map((col) => (
                <ColumnCell
                  key={col.id}
                  tasks={row.tasks.filter((t) => t.taskboard.columnId === col.id)}
                />
              ))}
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function ColumnHeader({ column, count }: { column: AdoTaskboardColumn; count: number }) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-zinc-900/70 px-3 py-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-300">
        {column.name}
      </span>
      <span className="text-[11px] font-mono text-zinc-500">{count}</span>
      {isDoneColumn(column.name) && count > 0 && (
        <Check className="h-3.5 w-3.5 text-emerald-500 ml-auto" />
      )}
    </div>
  );
}

function ColumnCell({ tasks }: { tasks: TaskOnBoard[] }) {
  return (
    <div className="rounded-md bg-zinc-900/30 p-2 space-y-2 min-h-[88px]">
      {tasks.map((t) => (
        <TaskCard key={t.workItem.id} task={t} />
      ))}
    </div>
  );
}
