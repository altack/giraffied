import { useMemo } from 'react';
import { Clock, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { listWorkItemUpdates } from '@/ado/endpoints';
import type { AdoIdentity, AdoWorkItemUpdate } from '@/ado/types';
import { Avatar } from './Avatar';
import { formatHours, relativeTime } from './timeFormat';

interface LogEntry {
  by: AdoIdentity | undefined;
  at: string;
  delta: number;
  runningTotal: number;
}

function identityKey(i: AdoIdentity | undefined): string {
  if (!i) return '__unknown__';
  return i.uniqueName ?? i.id ?? i.displayName;
}

/** ADO doesn't have first-class time-log entries — we reconstruct a log from the
 *  work-item revision feed by diffing `Microsoft.VSTS.Scheduling.CompletedWork`
 *  between consecutive revs. This is the same data the native "History" tab pulls
 *  from, just filtered to the field we care about. */
export function WorkLogPanel({
  workItemId,
  projectId,
  enabled,
}: {
  workItemId: number;
  projectId: string | null;
  enabled: boolean;
}) {
  const q = useQuery({
    queryKey: ['workitem-updates', projectId, workItemId],
    queryFn: () => listWorkItemUpdates(projectId!, workItemId),
    enabled: enabled && !!projectId,
    staleTime: 60_000,
    retry: false,
  });

  const { entries, totals, grandTotal } = useMemo(() => {
    const entries: LogEntry[] = [];
    const totals = new Map<string, { identity: AdoIdentity | undefined; total: number }>();
    let grandTotal = 0;
    for (const upd of q.data ?? []) {
      const ch = upd.fields?.['Microsoft.VSTS.Scheduling.CompletedWork'];
      if (!ch) continue;
      const oldV = numOrZero(ch.oldValue);
      const newV = numOrZero(ch.newValue);
      const delta = round(newV - oldV);
      if (delta === 0) continue;
      grandTotal = newV;
      entries.push({ by: upd.revisedBy, at: upd.revisedDate, delta, runningTotal: newV });
      const key = identityKey(upd.revisedBy);
      const cur = totals.get(key) ?? { identity: upd.revisedBy, total: 0 };
      cur.total = round(cur.total + delta);
      totals.set(key, cur);
    }
    entries.reverse();
    return { entries, totals, grandTotal };
  }, [q.data]);

  if (q.isLoading) {
    return (
      <div className="text-[12px] text-zinc-500 flex items-center gap-1.5 py-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading work log…
      </div>
    );
  }
  if (q.isError) {
    return <div className="text-[12px] text-red-300/80 py-2">Couldn't load work log.</div>;
  }
  if (entries.length === 0) {
    return (
      <div className="rounded-md border border-white/[0.06] bg-white/[0.015] p-4 text-[12px] text-zinc-600 flex items-center gap-2">
        <Clock className="h-3.5 w-3.5" /> No time logged yet.
      </div>
    );
  }

  const summary = [...totals.values()].sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-white/[0.06] bg-white/[0.015] p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] uppercase tracking-[0.12em] text-zinc-500">
            By person
          </div>
          <div className="mono text-[12px] text-zinc-300">{formatHours(grandTotal)} total</div>
        </div>
        <div className="space-y-1.5">
          {summary.map((row) => {
            const pct = grandTotal > 0 ? (row.total / grandTotal) * 100 : 0;
            return (
              <div
                key={identityKey(row.identity)}
                className="flex items-center gap-2 text-[12px]"
              >
                <Avatar identity={row.identity} size="sm" />
                <div className="flex-1 h-1 rounded-full bg-white/[0.04] overflow-hidden">
                  <div
                    className="h-full bg-indigo-400/50"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="mono text-zinc-300 shrink-0">{formatHours(row.total)}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-md border border-white/[0.06] bg-white/[0.015] divide-y divide-white/[0.04]">
        {entries.map((e, i) => (
          <div key={i} className="flex items-center gap-2 px-3 py-2 text-[12px]">
            <Avatar identity={e.by} size="sm" />
            <span className="text-zinc-200 truncate max-w-[180px]">
              {e.by?.displayName ?? 'Unknown'}
            </span>
            <span
              className={
                'mono shrink-0 ' + (e.delta >= 0 ? 'text-emerald-300/80' : 'text-amber-300/80')
              }
            >
              {e.delta >= 0 ? '+' : ''}
              {formatHours(e.delta)}
            </span>
            <span className="text-zinc-600 shrink-0">→</span>
            <span className="mono text-zinc-400 shrink-0">
              {formatHours(e.runningTotal)}
            </span>
            <span className="flex-1" />
            <span className="text-[11px] text-zinc-600 mono shrink-0">
              {relativeTime(e.at)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function numOrZero(v: unknown): number {
  const n = typeof v === 'number' ? v : v == null ? 0 : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round(n: number): number {
  return Number(n.toFixed(4));
}

export type { AdoWorkItemUpdate };
