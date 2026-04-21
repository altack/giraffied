import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { AlertCircle, ChevronDown, Clock, Loader2, Plus, UserX } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DraggableModal } from '@/components/ui/draggable-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AdoError } from '@/ado/client';
import type { AdoFieldPatch } from '@/ado/endpoints';
import {
  listWorkItemUpdates,
  patchWorkItemField,
  patchWorkItemFields,
} from '@/ado/endpoints';
import type {
  AdoIdentity,
  AdoTaskboardColumn,
  AdoWorkItem,
  AdoWorkItemUpdate,
} from '@/ado/types';
import type { TaskboardData, TaskOnBoard } from '@/ado/hooks/useTaskboard';
import { useTeamMembers } from '@/ado/hooks/useTeamMembers';
import { useSettings } from '@/state/settings.store';
import { Avatar } from './Avatar';
import { CopyLinkButton } from './CopyLinkButton';
import { DescriptionEditor } from './DescriptionEditor';
import { workItemTypeStyle } from './workItemVisuals';
import { cn } from '@/lib/cn';

const NUMBER_RE = /^-?\d*(\.\d*)?$/;

interface Draft {
  title: string;
  state: string;
  assignee: AdoIdentity | null;
  storyPoints: string;
  description: string;
}

function toDraft(task: TaskOnBoard): Draft {
  const f = task.workItem.fields;
  return {
    title: f['System.Title'] ?? '',
    state: f['System.State'] ?? '',
    assignee: f['System.AssignedTo'] ?? null,
    storyPoints: numToStr(f['Microsoft.VSTS.Scheduling.StoryPoints']),
    description: f['System.Description'] ?? '',
  };
}

function numToStr(n: number | undefined): string {
  return n == null ? '' : String(n);
}

function parseOptionalNumber(s: string): number | null | 'invalid' {
  const t = s.trim();
  if (!t) return null;
  if (!NUMBER_RE.test(t)) return 'invalid';
  const n = Number(t);
  return Number.isFinite(n) ? n : 'invalid';
}

function buildPatches(
  original: Draft,
  draft: Draft,
): { patches: AdoFieldPatch[]; error?: string } {
  const patches: AdoFieldPatch[] = [];

  if (draft.title !== original.title) {
    if (!draft.title.trim()) return { patches: [], error: 'Title cannot be empty' };
    patches.push({ field: 'System.Title', value: draft.title.trim() });
  }
  if (draft.state !== original.state) {
    patches.push({ field: 'System.State', value: draft.state });
  }
  if (
    (draft.assignee?.uniqueName ?? null) !== (original.assignee?.uniqueName ?? null) ||
    (draft.assignee?.displayName ?? null) !== (original.assignee?.displayName ?? null)
  ) {
    patches.push({
      field: 'System.AssignedTo',
      value: draft.assignee?.uniqueName ?? draft.assignee?.displayName ?? null,
    });
  }
  if (draft.storyPoints !== original.storyPoints) {
    const v = parseOptionalNumber(draft.storyPoints);
    if (v === 'invalid') return { patches: [], error: 'Story Points must be a number' };
    patches.push({ field: 'Microsoft.VSTS.Scheduling.StoryPoints', value: v });
  }
  if (draft.description !== original.description) {
    patches.push({ field: 'System.Description', value: draft.description });
  }
  return { patches };
}

function applyDraftToTaskboard(
  data: TaskboardData,
  workItemId: number,
  wiType: string,
  draft: Draft,
): TaskboardData {
  const mappedCol = data.columns.find(
    (c) => (c.mappings[wiType] ?? null) === draft.state,
  );
  const patched = (task: TaskOnBoard): TaskOnBoard => {
    if (task.workItem.id !== workItemId) return task;
    const sp = parseOptionalNumber(draft.storyPoints);
    const nextFields: AdoWorkItem['fields'] = {
      ...task.workItem.fields,
      'System.Title': draft.title.trim() || task.workItem.fields['System.Title'],
      'System.State': draft.state,
      'System.AssignedTo': draft.assignee ?? undefined,
      'System.Description': draft.description,
      'Microsoft.VSTS.Scheduling.StoryPoints':
        sp === 'invalid'
          ? task.workItem.fields['Microsoft.VSTS.Scheduling.StoryPoints']
          : (sp as number | null) ?? undefined,
    };
    return {
      workItem: { ...task.workItem, fields: nextFields },
      taskboard: mappedCol
        ? {
            ...task.taskboard,
            state: draft.state,
            columnId: mappedCol.id,
            column: mappedCol.name,
          }
        : { ...task.taskboard, state: draft.state },
    };
  };
  return {
    ...data,
    swimlanes: data.swimlanes.map((lane) => ({
      ...lane,
      tasks: lane.tasks.map(patched),
    })),
    unparented: data.unparented.map(patched),
  };
}

function stateOptionsFor(
  columns: AdoTaskboardColumn[],
  wiType: string,
  currentState: string,
): string[] {
  const opts = new Set<string>();
  for (const c of columns) {
    const s = c.mappings[wiType];
    if (s) opts.add(s);
  }
  if (currentState) opts.add(currentState);
  return [...opts];
}

interface WorkItemModalProps {
  task: TaskOnBoard;
  columns: AdoTaskboardColumn[];
  open: boolean;
  onClose: () => void;
  iterationId: string;
  boardAssignees: AdoIdentity[];
}

export function WorkItemModal({
  task,
  columns,
  open,
  onClose,
  iterationId,
  boardAssignees,
}: WorkItemModalProps) {
  const projectId = useSettings((s) => s.projectId);
  const teamId = useSettings((s) => s.teamId);
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => ['taskboard', projectId, teamId, iterationId],
    [projectId, teamId, iterationId],
  );

  const wiType = task.workItem.fields['System.WorkItemType'];
  const type = workItemTypeStyle(wiType);
  const original = useMemo(() => toDraft(task), [task]);
  const [draft, setDraft] = useState<Draft>(original);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(original);
    setError(null);
  }, [original, open]);

  const stateOptions = useMemo(
    () => stateOptionsFor(columns, wiType, original.state),
    [columns, wiType, original.state],
  );

  const dirty =
    draft.title !== original.title ||
    draft.state !== original.state ||
    (draft.assignee?.uniqueName ?? null) !== (original.assignee?.uniqueName ?? null) ||
    draft.storyPoints !== original.storyPoints ||
    draft.description !== original.description;

  const save = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error('Missing project');
      const { patches, error } = buildPatches(original, draft);
      if (error) throw new Error(error);
      if (patches.length === 0) return null;
      return patchWorkItemFields(projectId, task.workItem.id, patches);
    },
    onMutate: () => {
      const prev = queryClient.getQueryData<TaskboardData>(queryKey);
      if (prev) {
        queryClient.setQueryData<TaskboardData>(
          queryKey,
          applyDraftToTaskboard(prev, task.workItem.id, wiType, draft),
        );
      }
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev);
      setError(
        err instanceof AdoError
          ? `${err.status} ${err.statusText} — ${err.body.slice(0, 200)}`
          : err instanceof Error
            ? err.message
            : String(err),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      onClose();
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = buildPatches(original, draft);
    if (error) {
      setError(error);
      return;
    }
    save.mutate();
  }

  return (
    <DraggableModal
      open={open}
      onClose={onClose}
      width={640}
      title={
        <span className="flex items-center gap-1.5 min-w-0">
          <span
            className="h-1.5 w-1.5 rounded-full shrink-0"
            style={{ backgroundColor: type.dot }}
            aria-hidden
          />
          <span className="text-zinc-400 shrink-0">{type.label}</span>
          <span className="text-zinc-700 shrink-0">·</span>
          <span className="mono text-zinc-500 shrink-0">#{task.workItem.id}</span>
        </span>
      }
      headerActions={
        <div data-no-drag className="mr-1">
          <CopyLinkButton workItemId={task.workItem.id} />
        </div>
      }
      footer={
        <>
          {error && (
            <div className="mr-auto flex items-center gap-1.5 text-[11px] text-red-300/90">
              <AlertCircle className="h-3.5 w-3.5" />
              <span className="mono truncate max-w-[360px]">{error}</span>
            </div>
          )}
          <Button variant="ghost" size="sm" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            type="submit"
            form="workitem-form"
            disabled={!dirty || save.isPending}
          >
            {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save
          </Button>
        </>
      }
    >
      <form
        id="workitem-form"
        onSubmit={handleSubmit}
        className="px-5 py-4 space-y-5"
      >
        <textarea
          autoFocus
          value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          rows={2}
          className={cn(
            'w-full rounded-md px-3 py-2 resize-none',
            'text-[16px] leading-[1.35] font-medium text-zinc-50',
            'bg-transparent border border-transparent',
            'hover:bg-white/[0.02] hover:border-white/[0.04]',
            'focus-visible:outline-none focus-visible:bg-white/[0.03] focus-visible:border-indigo-400/30 focus-visible:ring-2 focus-visible:ring-indigo-400/15',
            'transition-colors duration-150',
          )}
        />

        <div className="grid grid-cols-[1fr_1.4fr_auto] gap-2.5">
          <FieldCell label="Status">
            <div className="relative">
              <select
                value={draft.state}
                onChange={(e) => setDraft((d) => ({ ...d, state: e.target.value }))}
                className={cn(
                  'appearance-none w-full h-8 rounded-md pl-3 pr-8 text-[13px] text-zinc-100',
                  'bg-white/[0.03] border border-white/[0.08]',
                  'focus-visible:outline-none focus-visible:border-indigo-400/40 focus-visible:ring-2 focus-visible:ring-indigo-400/15',
                  'transition-colors duration-150',
                )}
              >
                {stateOptions.map((s) => (
                  <option key={s} value={s} className="bg-[#141418] text-zinc-100">
                    {s}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
            </div>
          </FieldCell>
          <FieldCell label="Assignee">
            <AssigneePicker
              value={draft.assignee}
              onChange={(a) => setDraft((d) => ({ ...d, assignee: a }))}
              boardAssignees={boardAssignees}
            />
          </FieldCell>
          <FieldCell label="Points">
            <Input
              inputMode="decimal"
              value={draft.storyPoints}
              onChange={(e) =>
                setDraft((d) => ({ ...d, storyPoints: e.target.value }))
              }
              placeholder="—"
              className="w-16 text-center"
            />
          </FieldCell>
        </div>

        <Section label="Description">
          <DescriptionEditor
            value={draft.description}
            onChange={(html) => setDraft((d) => ({ ...d, description: html }))}
          />
        </Section>

        <Section label="Time tracking">
          <TimeTracking
            workItemId={task.workItem.id}
            projectId={projectId}
            currentCompleted={
              task.workItem.fields['Microsoft.VSTS.Scheduling.CompletedWork'] ?? 0
            }
            queryKey={queryKey}
          />
        </Section>

        <Section label="History">
          <HistoryPanel workItemId={task.workItem.id} projectId={projectId} open={open} />
        </Section>
      </form>
    </DraggableModal>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
        {label}
      </div>
      {children}
    </div>
  );
}

function FieldCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
        {label}
      </div>
      {children}
    </div>
  );
}

/* ── Assignee ─────────────────────────────────────────────────────────────── */

function AssigneePicker({
  value,
  onChange,
  boardAssignees,
}: {
  value: AdoIdentity | null;
  onChange: (a: AdoIdentity | null) => void;
  boardAssignees: AdoIdentity[];
}) {
  const { data: members, isLoading: membersLoading, isError } = useTeamMembers();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const identityKey = (i: AdoIdentity) => i.uniqueName ?? i.id ?? i.displayName;

  const { results, searching } = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) {
      // Default: just the people actually on this board. Much more accurate than the
      // raw team-members endpoint, which can include retired or unrelated accounts.
      return { results: boardAssignees, searching: false };
    }
    const pool = new Map<string, AdoIdentity>();
    for (const a of boardAssignees) pool.set(identityKey(a), a);
    for (const m of members ?? []) pool.set(identityKey(m.identity), m.identity);
    const matches: AdoIdentity[] = [];
    for (const id of pool.values()) {
      const hay =
        (id.displayName ?? '').toLowerCase() + ' ' + (id.uniqueName ?? '').toLowerCase();
      if (hay.includes(q)) matches.push(id);
    }
    matches.sort((a, b) =>
      a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }),
    );
    return { results: matches.slice(0, 100), searching: true };
  }, [filter, boardAssignees, members]);

  const pick = useCallback(
    (id: AdoIdentity | null) => {
      onChange(id);
      setOpen(false);
      setFilter('');
    },
    [onChange],
  );

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'w-full h-8 flex items-center gap-2 rounded-md px-2.5 text-[13px] text-left',
          'bg-white/[0.03] border border-white/[0.08] text-zinc-100',
          'hover:bg-white/[0.05]',
          'focus-visible:outline-none focus-visible:border-indigo-400/40 focus-visible:ring-2 focus-visible:ring-indigo-400/15',
          'transition-colors duration-150',
        )}
      >
        <Avatar identity={value ?? undefined} size="sm" />
        <span className="truncate flex-1">{value?.displayName ?? 'Unassigned'}</span>
        <ChevronDown className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
      </button>
      {open && (
        <div
          data-no-drag
          className="absolute z-10 mt-1 right-0 w-72 rounded-md border border-white/[0.08] bg-[var(--color-surface-2)]/95 backdrop-blur-xl shadow-2xl shadow-black/50 overflow-hidden"
        >
          <div className="p-1.5 border-b border-white/[0.06]">
            <Input
              autoFocus
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search people…"
              className="h-7"
            />
          </div>
          <div className="max-h-64 overflow-auto py-1">
            <button
              type="button"
              onClick={() => pick(null)}
              className={cn(
                'w-full flex items-center gap-2 px-2.5 py-1.5 text-[13px] text-zinc-400 hover:bg-white/[0.04]',
                value === null && 'bg-white/[0.03] text-zinc-100',
              )}
            >
              <UserX className="h-4 w-4 text-zinc-500" />
              Unassigned
            </button>
            {isError && (
              <div className="px-2.5 py-2 text-[12px] text-red-300/80">
                Couldn't load team members.
              </div>
            )}
            {results.map((id) => {
              const selected = identityKey(id) === (value ? identityKey(value) : null);
              return (
                <button
                  key={identityKey(id)}
                  type="button"
                  onClick={() => pick(id)}
                  className={cn(
                    'w-full flex items-center gap-2 px-2.5 py-1.5 text-[13px] text-zinc-200 hover:bg-white/[0.04]',
                    selected && 'bg-white/[0.03]',
                  )}
                >
                  <Avatar identity={id} size="sm" />
                  <span className="truncate flex-1 text-left">{id.displayName}</span>
                  {id.uniqueName && (
                    <span className="text-[11px] text-zinc-600 truncate mono max-w-[140px]">
                      {id.uniqueName}
                    </span>
                  )}
                </button>
              );
            })}
            {results.length === 0 && !isError && (
              <div className="px-2.5 py-2 text-[12px] text-zinc-600 flex items-center gap-1.5">
                {searching && membersLoading && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
                {searching
                  ? membersLoading
                    ? 'Searching team…'
                    : 'No matches.'
                  : 'No one is on this board yet.'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Time tracking ────────────────────────────────────────────────────────── */

function TimeTracking({
  workItemId,
  projectId,
  currentCompleted,
  queryKey,
}: {
  workItemId: number;
  projectId: string | null;
  currentCompleted: number;
  queryKey: unknown[];
}) {
  const queryClient = useQueryClient();
  const [input, setInput] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const log = useMutation({
    mutationFn: async (add: number) => {
      if (!projectId) throw new Error('Missing project');
      const next = Number((currentCompleted + add).toFixed(4));
      return patchWorkItemField(
        projectId,
        workItemId,
        'Microsoft.VSTS.Scheduling.CompletedWork',
        next,
      );
    },
    onSuccess: (wi) => {
      // Optimistically update the cached board entry so the displayed total moves
      // without waiting for the next 30s refetch.
      queryClient.setQueryData<TaskboardData>(queryKey as never, (prev) => {
        if (!prev) return prev;
        const patch = (t: TaskOnBoard): TaskOnBoard =>
          t.workItem.id === workItemId
            ? {
                ...t,
                workItem: {
                  ...t.workItem,
                  fields: {
                    ...t.workItem.fields,
                    'Microsoft.VSTS.Scheduling.CompletedWork':
                      wi?.fields['Microsoft.VSTS.Scheduling.CompletedWork'],
                  },
                },
              }
            : t;
        return {
          ...prev,
          swimlanes: prev.swimlanes.map((lane) => ({
            ...lane,
            tasks: lane.tasks.map(patch),
          })),
          unparented: prev.unparented.map(patch),
        };
      });
      queryClient.invalidateQueries({ queryKey: queryKey as never });
      setInput('');
      setErr(null);
    },
    onError: (e) => {
      setErr(e instanceof Error ? e.message : String(e));
    },
  });

  function handleAdd(e: FormEvent) {
    e.preventDefault();
    const n = Number(input);
    if (!Number.isFinite(n) || n === 0) {
      setErr('Enter a positive or negative number of hours');
      return;
    }
    setErr(null);
    log.mutate(n);
  }

  return (
    <div
      className={cn(
        'rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2.5',
        'flex items-center gap-4 flex-wrap',
      )}
    >
      <div className="flex items-center gap-2 text-[13px] text-zinc-200">
        <Clock className="h-3.5 w-3.5 text-zinc-500" />
        <span className="mono">{formatHours(currentCompleted)}</span>
        <span className="text-zinc-600">logged</span>
      </div>
      <div className="h-5 w-px bg-white/[0.06]" />
      <div className="flex items-center gap-1.5">
        <div className="relative">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-zinc-600 text-[13px] mono">
            +
          </span>
          <Input
            inputMode="decimal"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd(e as unknown as FormEvent);
            }}
            placeholder="0"
            className="h-7 w-20 pl-5 pr-2 text-[13px] mono"
          />
        </div>
        <span className="text-[12px] text-zinc-600">h</span>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={handleAdd}
          disabled={log.isPending || !input}
        >
          {log.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          Log
        </Button>
      </div>
      {err && (
        <span className="basis-full text-[11px] text-red-300/80 mono">{err}</span>
      )}
    </div>
  );
}

function formatHours(h: number): string {
  if (!h) return '0h';
  if (Number.isInteger(h)) return `${h}h`;
  return `${h.toFixed(1)}h`;
}

/* ── History ──────────────────────────────────────────────────────────────── */

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

function HistoryPanel({
  workItemId,
  projectId,
  open,
}: {
  workItemId: number;
  projectId: string | null;
  open: boolean;
}) {
  const q = useQuery({
    queryKey: ['workitem-updates', projectId, workItemId],
    queryFn: () => listWorkItemUpdates(projectId!, workItemId),
    enabled: open && !!projectId,
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

  const events = (q.data ?? [])
    .flatMap((upd) => describeUpdate(upd))
    .reverse()
    .slice(0, 40);

  if (events.length === 0) {
    return <div className="text-[12px] text-zinc-600 py-2">No activity yet.</div>;
  }

  return (
    <div className="rounded-md border border-white/[0.06] bg-white/[0.015] divide-y divide-white/[0.04] max-h-56 overflow-auto">
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
      return `renamed to “${newStr}”`;
    case 'System.AssignedTo':
      if (!newStr) return 'unassigned';
      return oldStr ? `reassigned to ${newStr}` : `assigned to ${newStr}`;
    case 'System.Description':
      return 'updated the description';
    case 'System.Tags':
      return `updated tags (${newStr || '—'})`;
    case 'Microsoft.VSTS.Scheduling.StoryPoints':
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

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const sec = Math.max(0, Math.round((now - then) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mon = Math.round(day / 30);
  if (mon < 12) return `${mon}mo ago`;
  return `${Math.round(mon / 12)}y ago`;
}
