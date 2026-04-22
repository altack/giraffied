import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import {
  AlertCircle,
  ChevronDown,
  Clock,
  History as HistoryIcon,
  Loader2,
  MessageSquare,
  Plus,
  Timer,
  UserX,
  X,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DraggableModal } from '@/components/ui/draggable-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs } from '@/components/ui/tabs';
import { AdoError } from '@/ado/client';
import type { AdoFieldPatch } from '@/ado/endpoints';
import {
  patchWorkItemField,
  patchWorkItemFields,
} from '@/ado/endpoints';
import type {
  AdoIdentity,
  AdoTaskboardColumn,
  AdoWorkItem,
} from '@/ado/types';
import type { TaskboardData, TaskOnBoard } from '@/ado/hooks/useTaskboard';
import { useComments } from '@/ado/hooks/useComments';
import { useTeamMembers } from '@/ado/hooks/useTeamMembers';
import { useSettings } from '@/state/settings.store';
import { cn } from '@/lib/cn';
import { Avatar } from './Avatar';
import { CommentsPanel } from './CommentsPanel';
import { CopyLinkButton } from './CopyLinkButton';
import { DescriptionField } from './DescriptionField';
import { HistoryPanel } from './HistoryPanel';
import { WorkLogPanel } from './WorkLogPanel';
import { formatHours } from './timeFormat';
import {
  readPoints,
  workItemTypeStyle,
  writePointsFieldFor,
  POINTS_FIELDS,
  type PointsFieldName,
} from './workItemVisuals';

const NUMBER_RE = /^-?\d*(\.\d*)?$/;

type ActivityTab = 'comments' | 'worklog' | 'history';

interface Draft {
  title: string;
  state: string;
  assignee: AdoIdentity | null;
  storyPoints: string;
  tags: string[];
  description: string;
}

function toDraft(task: TaskOnBoard): Draft {
  const f = task.workItem.fields;
  return {
    title: f['System.Title'] ?? '',
    state: f['System.State'] ?? '',
    assignee: f['System.AssignedTo'] ?? null,
    storyPoints: numToStr(readPoints(f)),
    tags: splitTags(f['System.Tags']),
    description: f['System.Description'] ?? '',
  };
}

function splitTags(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[;,]/)
    .map((t) => t.trim())
    .filter(Boolean);
}
function joinTags(tags: string[]): string {
  return tags.join('; ');
}
function tagsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
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
  pointsField: PointsFieldName,
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
    patches.push({ field: pointsField, value: v });
  }
  if (!tagsEqual(draft.tags, original.tags)) {
    patches.push({ field: 'System.Tags', value: joinTags(draft.tags) });
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
  pointsField: PointsFieldName,
): TaskboardData {
  const mappedCol = data.columns.find(
    (c) => (c.mappings[wiType] ?? null) === draft.state,
  );

  const patchFields = (fields: AdoWorkItem['fields']): AdoWorkItem['fields'] => {
    const sp = parseOptionalNumber(draft.storyPoints);
    const nextPoints = sp === 'invalid' ? fields[pointsField] : (sp as number | null) ?? undefined;
    // Clear any sibling points fields so the banner's readPoints resolver doesn't
    // fall back to a stale value that used to live under a different field name.
    const clearedSiblings: Partial<Record<PointsFieldName, undefined>> = {};
    for (const f of POINTS_FIELDS) {
      if (f !== pointsField) clearedSiblings[f] = undefined;
    }
    return {
      ...fields,
      ...clearedSiblings,
      'System.Title': draft.title.trim() || fields['System.Title'],
      'System.State': draft.state,
      'System.AssignedTo': draft.assignee ?? undefined,
      'System.Description': draft.description,
      'System.Tags': joinTags(draft.tags),
      [pointsField]: nextPoints,
    };
  };

  const patchCard = (task: TaskOnBoard): TaskOnBoard => {
    if (task.workItem.id !== workItemId) return task;
    return {
      workItem: { ...task.workItem, fields: patchFields(task.workItem.fields) },
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

  const patchRow = (row: AdoWorkItem): AdoWorkItem =>
    row.id === workItemId ? { ...row, fields: patchFields(row.fields) } : row;

  return {
    ...data,
    swimlanes: data.swimlanes.map((lane) => ({
      ...lane,
      row: patchRow(lane.row),
      tasks: lane.tasks.map(patchCard),
    })),
    unparented: data.unparented.map(patchCard),
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
  const [tab, setTab] = useState<ActivityTab>('comments');

  useEffect(() => {
    setDraft(original);
    setError(null);
  }, [original, open]);

  const stateOptions = useMemo(
    () => stateOptionsFor(columns, wiType, original.state),
    [columns, wiType, original.state],
  );

  // Pick the points field to write back to — whichever one currently holds a value,
  // or the template default for this work-item type.
  const pointsField = useMemo(
    () => writePointsFieldFor(task.workItem.fields),
    [task.workItem.fields],
  );

  const dirty =
    draft.title !== original.title ||
    draft.state !== original.state ||
    (draft.assignee?.uniqueName ?? null) !== (original.assignee?.uniqueName ?? null) ||
    draft.storyPoints !== original.storyPoints ||
    !tagsEqual(draft.tags, original.tags) ||
    draft.description !== original.description;

  const save = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error('Missing project');
      const { patches, error } = buildPatches(original, draft, pointsField);
      if (error) throw new Error(error);
      if (patches.length === 0) return null;
      return patchWorkItemFields(projectId, task.workItem.id, patches);
    },
    onMutate: () => {
      const prev = queryClient.getQueryData<TaskboardData>(queryKey);
      if (prev) {
        queryClient.setQueryData<TaskboardData>(
          queryKey,
          applyDraftToTaskboard(prev, task.workItem.id, wiType, draft, pointsField),
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
    const { error } = buildPatches(original, draft, pointsField);
    if (error) {
      setError(error);
      return;
    }
    save.mutate();
  }

  // Preload comments count for the tab badge (enabled only while modal is open).
  const comments = useComments(task.workItem.id, open && tab === 'comments');

  return (
    <DraggableModal
      open={open}
      onClose={onClose}
      width={940}
      heightVh={88}
      fixedHeight
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
      <div className="flex h-full min-h-0">
        <form
          id="workitem-form"
          onSubmit={handleSubmit}
          className="flex-1 min-w-0 overflow-y-auto px-5 py-4 space-y-4"
        >
          <textarea
            autoFocus
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            rows={1}
            className={cn(
              'w-full field-sizing-content rounded-md px-3 py-2 resize-none',
              'text-[17px] leading-[1.3] font-medium text-zinc-50',
              'bg-transparent border border-transparent',
              'hover:bg-white/[0.02] hover:border-white/[0.04]',
              'focus-visible:outline-none focus-visible:bg-white/[0.03] focus-visible:border-indigo-400/30 focus-visible:ring-2 focus-visible:ring-indigo-400/15',
              'transition-colors duration-150',
            )}
          />

          <Section label="Description">
            <DescriptionField
              value={draft.description}
              onChange={(html) => setDraft((d) => ({ ...d, description: html }))}
              placeholder="Add a description…"
            />
          </Section>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Activity
              </div>
              <Tabs<ActivityTab>
                value={tab}
                onChange={setTab}
                items={[
                  {
                    value: 'comments',
                    label: (
                      <span className="inline-flex items-center gap-1.5">
                        <MessageSquare className="h-3 w-3" />
                        Comments
                      </span>
                    ),
                    badge: comments.data?.length ?? undefined,
                  },
                  {
                    value: 'worklog',
                    label: (
                      <span className="inline-flex items-center gap-1.5">
                        <Timer className="h-3 w-3" />
                        Work Log
                      </span>
                    ),
                  },
                  {
                    value: 'history',
                    label: (
                      <span className="inline-flex items-center gap-1.5">
                        <HistoryIcon className="h-3 w-3" />
                        History
                      </span>
                    ),
                  },
                ]}
              />
            </div>
            <div className="min-h-[80px]">
              {tab === 'comments' && (
                <CommentsPanel workItemId={task.workItem.id} enabled={open} />
              )}
              {tab === 'worklog' && (
                <WorkLogPanel
                  workItemId={task.workItem.id}
                  projectId={projectId}
                  enabled={open}
                />
              )}
              {tab === 'history' && (
                <HistoryPanel
                  workItemId={task.workItem.id}
                  projectId={projectId}
                  enabled={open}
                />
              )}
            </div>
          </div>
        </form>

        <aside className="w-[280px] shrink-0 overflow-y-auto border-l border-white/[0.06] bg-white/[0.015] px-4 py-4 space-y-4">
          <SidebarField label="Status">
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
          </SidebarField>
          <SidebarField label="Assignee">
            <AssigneePicker
              value={draft.assignee}
              onChange={(a) => setDraft((d) => ({ ...d, assignee: a }))}
              boardAssignees={boardAssignees}
            />
          </SidebarField>
          <SidebarField label="Story Points">
            <Input
              inputMode="decimal"
              value={draft.storyPoints}
              onChange={(e) =>
                setDraft((d) => ({ ...d, storyPoints: e.target.value }))
              }
              placeholder="—"
              className="w-24"
            />
          </SidebarField>
          <SidebarField label="Tags">
            <TagsEditor
              tags={draft.tags}
              onChange={(tags) => setDraft((d) => ({ ...d, tags }))}
            />
          </SidebarField>
          <SidebarField label="Time tracking">
            <TimeTracking
              workItemId={task.workItem.id}
              projectId={projectId}
              currentCompleted={
                task.workItem.fields['Microsoft.VSTS.Scheduling.CompletedWork'] ?? 0
              }
              queryKey={queryKey}
            />
          </SidebarField>
        </aside>
      </div>
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

function SidebarField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
        {label}
      </div>
      {children}
    </div>
  );
}

/* ── Tags editor ──────────────────────────────────────────────────────────── */

function TagsEditor({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState('');

  function commit(raw: string) {
    const pieces = raw
      .split(/[;,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (pieces.length === 0) return;
    const existing = new Set(tags.map((t) => t.toLowerCase()));
    const additions = pieces.filter((p) => !existing.has(p.toLowerCase()));
    if (additions.length === 0) return;
    onChange([...tags, ...additions]);
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',' || e.key === ';' || e.key === 'Tab') {
      if (!draft.trim()) return;
      e.preventDefault();
      commit(draft);
      setDraft('');
    } else if (e.key === 'Backspace' && !draft && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  }

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-1 min-h-[32px] rounded-md px-1.5 py-1',
        'bg-white/[0.03] border border-white/[0.08]',
        'focus-within:border-indigo-400/40 focus-within:ring-2 focus-within:ring-indigo-400/15',
        'transition-colors duration-150',
      )}
    >
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-0.5 rounded bg-white/[0.06] pl-2 pr-0.5 py-0.5 text-[11px] text-zinc-200 lit-top"
        >
          {tag}
          <button
            type="button"
            // Prevent the input's onBlur from firing first and swallowing the click
            // (which it would, since blur re-renders and the button could unmount).
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              onChange(tags.filter((t) => t !== tag));
            }}
            aria-label={`Remove tag ${tag}`}
            className="inline-flex items-center justify-center h-4 w-4 rounded text-zinc-500 hover:text-zinc-100 hover:bg-white/[0.08] transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKey}
        onBlur={() => {
          if (draft.trim()) {
            commit(draft);
            setDraft('');
          }
        }}
        placeholder={tags.length === 0 ? 'Add tag…' : ''}
        className="flex-1 min-w-[80px] bg-transparent text-[12px] text-zinc-100 placeholder:text-zinc-600 outline-none px-1 py-0.5"
      />
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
    if (!q) return { results: boardAssignees, searching: false };
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
      // Invalidate the updates feed too so the Work Log tab reflects the new entry.
      queryClient.invalidateQueries({
        queryKey: ['workitem-updates', projectId, workItemId],
      });
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
      setErr('Enter hours (positive or negative)');
      return;
    }
    setErr(null);
    log.mutate(n);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-[13px] text-zinc-200">
        <Clock className="h-3.5 w-3.5 text-zinc-500" />
        <span className="mono">{formatHours(currentCompleted)}</span>
        <span className="text-zinc-600 text-[11px]">logged</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
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
            className="h-7 pl-5 pr-2 text-[13px] mono"
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
      {err && <div className="text-[11px] text-red-300/80 mono">{err}</div>}
    </div>
  );
}
