import { Fragment, type ReactNode } from 'react';
import type { TaskboardData, TaskOnBoard } from '@/ado/hooks/useTaskboard';
import type { AdoTaskboardColumn } from '@/ado/types';
import { cn } from '@/lib/cn';
import { TaskCard } from './TaskCard';
import { SwimlaneBanner, UnparentedBanner } from './SwimlaneHeader';

interface Row {
  key: string;
  banner: ReactNode;
  tasks: TaskOnBoard[];
  isFirst: boolean;
}

export function BoardGrid({ data }: { data: TaskboardData }) {
  const { columns, swimlanes, unparented } = data;

  const rows: Row[] = swimlanes.map((lane, idx) => ({
    key: `lane-${lane.row.id}`,
    banner: (
      <SwimlaneBanner
        row={lane.row}
        totalTasks={lane.tasks.length}
        points={lane.row.fields['Microsoft.VSTS.Scheduling.StoryPoints']}
      />
    ),
    tasks: lane.tasks,
    isFirst: idx === 0,
  }));
  if (unparented.length > 0) {
    rows.push({
      key: 'lane-unparented',
      banner: <UnparentedBanner totalTasks={unparented.length} />,
      tasks: unparented,
      isFirst: rows.length === 0,
    });
  }

  const gridTemplateColumns = `repeat(${columns.length}, minmax(280px, 1fr))`;

  return (
    <div className="flex-1 overflow-auto bg-zinc-950">
      <div className="min-w-max">
        {/* Column headers — sticky top, with a clear bottom border separating header row from board */}
        <div
          className="grid sticky top-0 z-20 bg-zinc-950 border-b border-zinc-800"
          style={{ gridTemplateColumns }}
        >
          {columns.map((col, i) => (
            <ColumnHeader
              key={col.id}
              column={col}
              count={rows.reduce(
                (n, r) => n + r.tasks.filter((t) => t.taskboard.columnId === col.id).length,
                0,
              )}
              isLast={i === columns.length - 1}
            />
          ))}
        </div>

        {/* Swimlanes — banner row + grid row of lane cells. Column tracks run vertically. */}
        {rows.map((row) => (
          <Fragment key={row.key}>
            {!row.isFirst && <div className="h-px bg-zinc-800" />}
            {row.banner}
            <div className="grid" style={{ gridTemplateColumns }}>
              {columns.map((col, i) => (
                <ColumnCell
                  key={col.id}
                  tasks={row.tasks.filter((t) => t.taskboard.columnId === col.id)}
                  isLast={i === columns.length - 1}
                />
              ))}
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function ColumnHeader({
  column,
  count,
  isLast,
}: {
  column: AdoTaskboardColumn;
  count: number;
  isLast: boolean;
}) {
  return (
    <div
      className={cn(
        'px-4 py-2.5 flex items-center gap-2',
        !isLast && 'border-r border-zinc-800',
      )}
    >
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-300">
        {column.name}
      </span>
      <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-sm bg-zinc-800 text-[10px] font-mono text-zinc-400">
        {count}
      </span>
    </div>
  );
}

function ColumnCell({ tasks, isLast }: { tasks: TaskOnBoard[]; isLast: boolean }) {
  return (
    <div
      className={cn(
        'p-2 space-y-1.5 min-h-[96px] bg-zinc-900/25',
        !isLast && 'border-r border-zinc-800',
      )}
    >
      {tasks.map((t) => (
        <TaskCard key={t.workItem.id} task={t} />
      ))}
    </div>
  );
}
