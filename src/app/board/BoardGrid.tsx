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
    <div className="flex-1 overflow-auto">
      <div className="min-w-max">
        {/* Column headers — sticky top */}
        <div
          className="grid sticky top-0 z-20 bg-zinc-950 border-b border-zinc-800"
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

        {/* Swimlanes — each is a banner row + a grid row of cells */}
        {rows.map((row, rowIdx) => (
          <Fragment key={row.key}>
            {row.banner}
            <div
              className={cn('grid', rowIdx !== rows.length - 1 && 'border-b border-zinc-900')}
              style={{ gridTemplateColumns }}
            >
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
    <div className="px-4 py-2.5 flex items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
        {column.name}
      </span>
      <span className="text-[11px] font-mono text-zinc-600">{count}</span>
    </div>
  );
}

function ColumnCell({ tasks }: { tasks: TaskOnBoard[] }) {
  return (
    <div className="p-2 space-y-1.5 min-h-[72px]">
      {tasks.map((t) => (
        <TaskCard key={t.workItem.id} task={t} />
      ))}
    </div>
  );
}
