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
    <div className="flex-1 overflow-auto">
      <div className="min-w-max px-5 pt-3 pb-6 space-y-3">
        {/* Column header row — sticky, blurred pane to cover scrolling cards underneath */}
        <div className="sticky top-0 z-20 -mx-5 px-5 py-2 bg-[var(--color-canvas)]/60 backdrop-blur-md border-b border-white/[0.04]">
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
  const done = isDoneColumn(column.name);
  return (
    <div className="flex items-center gap-2 px-1">
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
        {column.name}
      </span>
      <span className="mono text-[11px] text-zinc-600">{count}</span>
      {done && count > 0 && <Check className="h-3 w-3 text-emerald-400/80 ml-auto" />}
    </div>
  );
}

function ColumnCell({ tasks }: { tasks: TaskOnBoard[] }) {
  return (
    <div className="rounded-lg bg-white/[0.015] border border-white/[0.04] p-1.5 space-y-1.5 min-h-[96px]">
      {tasks.map((t) => (
        <TaskCard key={t.workItem.id} task={t} />
      ))}
    </div>
  );
}
