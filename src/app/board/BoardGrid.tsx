import { Fragment, type ReactNode } from 'react';
import type { TaskboardData, TaskOnBoard } from '@/ado/hooks/useTaskboard';
import type { AdoTaskboardColumn } from '@/ado/types';
import { cn } from '@/lib/cn';
import { TaskCard } from './TaskCard';
import { SwimlaneHeader, UnparentedSwimlaneHeader } from './SwimlaneHeader';

interface Row {
  key: string;
  header: ReactNode;
  tasks: TaskOnBoard[];
}

export function BoardGrid({ data }: { data: TaskboardData }) {
  const { columns, swimlanes, unparented } = data;

  const rows: Row[] = [
    ...swimlanes.map((lane) => ({
      key: `lane-${lane.row.id}`,
      header: <SwimlaneHeader row={lane.row} totalTasks={lane.tasks.length} />,
      tasks: lane.tasks,
    })),
  ];
  if (unparented.length > 0) {
    rows.push({
      key: 'lane-unparented',
      header: <UnparentedSwimlaneHeader totalTasks={unparented.length} />,
      tasks: unparented,
    });
  }

  const gridTemplateColumns = `minmax(220px, 260px) repeat(${columns.length}, minmax(260px, 1fr))`;

  return (
    <div className="flex-1 overflow-auto">
      <div
        className="grid min-w-max"
        style={{ gridTemplateColumns }}
      >
        <div className="sticky top-0 z-20 bg-zinc-950 border-b border-zinc-800" />
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

        {rows.map((row, rowIdx) => (
          <Fragment key={row.key}>
            <div
              className={cn(
                'bg-zinc-950/95 backdrop-blur-sm',
                rowIdx !== rows.length - 1 && 'border-b border-zinc-800',
              )}
            >
              {row.header}
            </div>
            {columns.map((col, colIdx) => (
              <ColumnCell
                key={col.id}
                tasks={row.tasks.filter((t) => t.taskboard.columnId === col.id)}
                isLastRow={rowIdx === rows.length - 1}
                isLastCol={colIdx === columns.length - 1}
              />
            ))}
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
        'sticky top-0 z-20 bg-zinc-950 border-b border-zinc-800 px-3 py-3 flex items-center gap-2',
        !isLast && 'border-r border-zinc-800',
      )}
    >
      <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
        {column.name}
      </span>
      <span className="text-[11px] font-mono text-zinc-500">{count}</span>
    </div>
  );
}

function ColumnCell({
  tasks,
  isLastRow,
  isLastCol,
}: {
  tasks: TaskOnBoard[];
  isLastRow: boolean;
  isLastCol: boolean;
}) {
  return (
    <div
      className={cn(
        'p-2 space-y-2 min-h-[96px] bg-zinc-950',
        !isLastRow && 'border-b border-zinc-800',
        !isLastCol && 'border-r border-zinc-800',
      )}
    >
      {tasks.map((t) => (
        <TaskCard key={t.workItem.id} task={t} />
      ))}
      {tasks.length === 0 && <div className="text-[11px] text-zinc-700 pl-1">—</div>}
    </div>
  );
}
