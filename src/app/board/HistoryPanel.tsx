import { Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { listWorkItemUpdates } from '@/ado/endpoints';
import type { AdoIdentity, AdoWorkItemUpdate } from '@/ado/types';
import { Avatar } from './Avatar';
import { relativeTime } from './timeFormat';

const HISTORY_IGNORED_FIELDS = new Set([
  'System.Rev',
  'System.ChangedBy',
  'System.ChangedDate',
  'System.AuthorizedAs',
  'System.AuthorizedDate',
  'System.RevisedDate',
  'System.Watermark',
  'System.PersonId',
  'System.BoardColumnDone',
  'System.BoardColumn',
  'System.BoardLane',
  'Microsoft.VSTS.Common.StateChangeDate',
  'Microsoft.VSTS.Common.ActivatedDate',
  'Microsoft.VSTS.Common.ActivatedBy',
  'Microsoft.VSTS.Common.ResolvedDate',
  'Microsoft.VSTS.Common.ResolvedBy',
  'Microsoft.VSTS.Common.ClosedDate',
  'Microsoft.VSTS.Common.ClosedBy',
  'Microsoft.VSTS.Common.StackRank',
]);

export function HistoryPanel({
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

  if (q.isLoading) {
    return (
      <div className="text-[12px] text-zinc-500 flex items-center gap-1.5 py-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading history…
      </div>
    );
  }
  if (q.isError) {
    return <div className="text-[12px] text-red-300/80 py-2">Couldn't load history.</div>;
  }

  const events = (q.data ?? []).flatMap(describeUpdate).reverse().slice(0, 80);

  if (events.length === 0) {
    return <div className="text-[12px] text-zinc-600 py-2">No activity yet.</div>;
  }

  return (
    <div className="rounded-md border border-white/[0.06] bg-white/[0.015] divide-y divide-white/[0.04]">
      {events.map((ev, i) => (
        <div key={i} className="flex items-start gap-2 px-3 py-2 text-[12px]">
          <div className="pt-0.5">
            <Avatar identity={ev.by} size="sm" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-zinc-300">
              <span className="font-medium">{ev.by?.displayName ?? 'Someone'}</span>{' '}
              <span className="text-zinc-500">{ev.summary}</span>
            </div>
          </div>
          <div className="text-[11px] text-zinc-600 mono shrink-0">
            {relativeTime(ev.at)}
          </div>
        </div>
      ))}
    </div>
  );
}

interface HistoryEvent {
  by: AdoIdentity | undefined;
  at: string;
  summary: string;
}

function describeUpdate(upd: AdoWorkItemUpdate): HistoryEvent[] {
  if (!upd.fields) return [];
  const out: HistoryEvent[] = [];
  for (const [field, change] of Object.entries(upd.fields)) {
    if (HISTORY_IGNORED_FIELDS.has(field)) continue;
    const summary = describeFieldChange(field, change.oldValue, change.newValue);
    if (!summary) continue;
    out.push({ by: upd.revisedBy, at: upd.revisedDate, summary });
  }
  return out;
}

function describeFieldChange(field: string, oldVal: unknown, newVal: unknown): string | null {
  const oldStr = formatFieldValue(oldVal);
  const newStr = formatFieldValue(newVal);
  if (oldStr === newStr) return null;

  switch (field) {
    case 'System.State':
      return `changed status ${oldStr || '—'} → ${newStr || '—'}`;
    case 'System.Title':
      return `renamed to "${newStr}"`;
    case 'System.AssignedTo':
      if (!newStr) return 'unassigned';
      return oldStr ? `reassigned to ${newStr}` : `assigned to ${newStr}`;
    case 'System.Description':
      return 'updated the description';
    case 'System.Tags':
      return `updated tags (${newStr || '—'})`;
    case 'Microsoft.VSTS.Scheduling.StoryPoints':
    case 'Microsoft.VSTS.Scheduling.Effort':
    case 'Microsoft.VSTS.Scheduling.Size':
      return `set points to ${newStr || '—'}`;
    case 'Microsoft.VSTS.Scheduling.RemainingWork':
      return `remaining: ${newStr || '0'}h`;
    case 'Microsoft.VSTS.Scheduling.CompletedWork':
      return `logged work: ${oldStr || '0'}h → ${newStr || '0'}h`;
    case 'Microsoft.VSTS.Scheduling.OriginalEstimate':
      return `set estimate to ${newStr || '0'}h`;
    default: {
      const label = field.replace(/^(System|Microsoft\.VSTS\.[^.]+)\./, '');
      return `updated ${label}`;
    }
  }
}

function formatFieldValue(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'object' && 'displayName' in (v as AdoIdentity)) {
    return (v as AdoIdentity).displayName;
  }
  return '';
}
