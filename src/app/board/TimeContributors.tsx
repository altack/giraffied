import { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { listWorkItemUpdates } from '@/ado/endpoints';
import type { AdoIdentity } from '@/ado/types';
import { Avatar } from './Avatar';
import { formatHours } from './timeFormat';
import { avatarColor } from './workItemVisuals';

interface Contributor {
  key: string;
  identity: AdoIdentity | undefined;
  total: number;
  pct: number;
  color: string;
}

function identityKey(i: AdoIdentity | undefined): string {
  if (!i) return '__unknown__';
  return i.uniqueName ?? i.id ?? i.displayName;
}

function numOrZero(v: unknown): number {
  const n = typeof v === 'number' ? v : v == null ? 0 : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round(n: number): number {
  return Number(n.toFixed(4));
}

/** Compact per-contributor breakdown of logged time. Reuses the same
 *  `workitem-updates` query the Work Log tab uses (TanStack dedupes), so no
 *  extra ADO round-trip. Renders a stacked horizontal bar keyed by each
 *  contributor's avatar color plus a row of avatars; both surfaces reveal a
 *  full-name / hours / percentage tooltip on hover.
 *
 *  Accounting matches the Work Log "By person" card: signed deltas are summed
 *  per author (so a correction by the same user reduces their own total) and
 *  the grand total is the last observed `CompletedWork` value, which equals
 *  the field on the work item. A contributor whose net contribution is zero
 *  or negative (rare — only happens when someone only ever logged negative
 *  corrections) is dropped from the bar. */
export function TimeContributors({
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

  const { contributors, grandTotal } = useMemo(() => {
    const byKey = new Map<string, { identity: AdoIdentity | undefined; total: number }>();
    let grand = 0;
    for (const upd of q.data ?? []) {
      const ch = upd.fields?.['Microsoft.VSTS.Scheduling.CompletedWork'];
      if (!ch) continue;
      const newV = numOrZero(ch.newValue);
      const delta = round(newV - numOrZero(ch.oldValue));
      if (delta === 0) continue;
      grand = newV;
      const k = identityKey(upd.revisedBy);
      const cur = byKey.get(k) ?? { identity: upd.revisedBy, total: 0 };
      cur.total = round(cur.total + delta);
      byKey.set(k, cur);
    }
    const list: Contributor[] = [...byKey.entries()]
      .filter(([, v]) => v.total > 0)
      .map(([key, v]) => ({
        key,
        identity: v.identity,
        total: v.total,
        pct: grand > 0 ? (v.total / grand) * 100 : 0,
        color: avatarColor(v.identity?.displayName ?? 'Unknown').bg,
      }))
      .sort((a, b) => b.total - a.total);
    return { contributors: list, grandTotal: grand };
  }, [q.data]);

  if (q.isLoading) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-zinc-600">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading contributors…
      </div>
    );
  }

  if (q.isError || contributors.length === 0 || grandTotal === 0) {
    return null;
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Contributors
        </div>
        <div className="mono text-[11px] text-zinc-400">
          {formatHours(grandTotal)} total
        </div>
      </div>

      <div
        className="flex h-1.5 w-full overflow-hidden rounded-full bg-white/[0.04]"
        role="img"
        aria-label={`Time split across ${contributors.length} contributor${contributors.length === 1 ? '' : 's'}`}
      >
        {contributors.map((c) => (
          <div
            key={c.key}
            title={tooltipFor(c)}
            className="h-full transition-opacity hover:opacity-80"
            style={{ width: `${c.pct}%`, backgroundColor: c.color }}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1 pt-0.5">
        {contributors.map((c) => (
          <span
            key={c.key}
            title={tooltipFor(c)}
            className="inline-flex cursor-default"
          >
            <Avatar identity={c.identity} size="sm" />
          </span>
        ))}
      </div>
    </div>
  );
}

function tooltipFor(c: Contributor): string {
  const name = c.identity?.displayName ?? 'Unknown';
  const pct = c.pct < 1 ? '<1' : String(Math.round(c.pct));
  return `${name} — ${formatHours(c.total)} (${pct}%)`;
}
