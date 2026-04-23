import {
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
  Save,
  History as HistoryIcon,
  Loader2,
  MessageSquare,
  Timer,
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
  AdoFieldDefinition,
  AdoIdentity,
  AdoTaskboardColumn,
  AdoWorkItem,
} from '@/ado/types';
import type { TaskboardData, TaskOnBoard } from '@/ado/hooks/useTaskboard';
import { useComments } from '@/ado/hooks/useComments';
import { useWorkItemFull } from '@/ado/hooks/useWorkItemFull';
import { useWorkItemTypeFields } from '@/ado/hooks/useWorkItemTypeFields';
import { useSettings } from '@/state/settings.store';
import { cn } from '@/lib/cn';
import { AssigneePicker } from './AssigneePicker';
import { Avatar } from './Avatar';
import { CommentsPanel } from './CommentsPanel';
import { CopyLinkButton } from './CopyLinkButton';
import { OpenLinkButton } from './OpenLinkButton';
import { DescriptionField } from './DescriptionField';
import { HistoryPanel } from './HistoryPanel';
import { MultiPicklistPicker } from './MultiPicklistPicker';
import { PicklistPicker } from './PicklistPicker';
import { TimeContributors } from './TimeContributors';
import { WorkLogPanel } from './WorkLogPanel';
import {
  readPoints,
  workItemTypeStyle,
  writePointsFieldFor,
  POINTS_FIELDS,
  type PointsFieldName,
} from './workItemVisuals';

const NUMBER_RE = /^-?\d*(\.\d*)?$/;
const POSITIVE_NUMBER_RE = /^\d*\.?\d*$/;

type ActivityTab = 'comments' | 'worklog' | 'history';

interface Draft {
  title: string;
  state: string;
  assignee: AdoIdentity | null;
  storyPoints: string;
  tags: string[];
  description: string;
  bugHotfix: string;
  components: string;
  environment: string[];
  rca: string;
  rcaDescription: string;
}

/** Display names we look up on the Bug work-item-type field list. The ADO reference
 *  names (Custom.DigitalPlatformsBugHotfix, etc.) vary by process template, so we
 *  match by the user-visible name and read referenceName back from the schema.
 *  The form labels may be shorter (e.g. just "Environment") — the matcher below
 *  also accepts any name that *ends with* the listed target, which catches the
 *  "Digital Platforms " prefix convention this org uses. */
const BUG_FIELD_DISPLAY_NAMES = {
  bugHotfix: 'Digital Platforms BugHotfix',
  components: 'Digital Platforms Components',
  environment: 'Digital Platforms Environment',
  rca: 'Digital Platforms RCA',
  rcaDescription: 'RCA Description',
} as const;

interface BugFieldMap {
  bugHotfix: AdoFieldDefinition | null;
  components: AdoFieldDefinition | null;
  environment: AdoFieldDefinition | null;
  rca: AdoFieldDefinition | null;
  rcaDescription: AdoFieldDefinition | null;
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
    bugHotfix: '',
    components: '',
    environment: [],
    rca: '',
    rcaDescription: '',
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

function asString(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
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
  bugFields: BugFieldMap | null,
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
  if (bugFields) {
    if (bugFields.bugHotfix && draft.bugHotfix !== original.bugHotfix) {
      patches.push({
        field: bugFields.bugHotfix.referenceName,
        value: draft.bugHotfix || null,
      });
    }
    if (bugFields.rca && draft.rca !== original.rca) {
      patches.push({
        field: bugFields.rca.referenceName,
        value: draft.rca || null,
      });
    }
    if (bugFields.environment && !tagsEqual(draft.environment, original.environment)) {
      patches.push({
        field: bugFields.environment.referenceName,
        value: draft.environment.length ? joinTags(draft.environment) : null,
      });
    }
    if (bugFields.components && draft.components !== original.components) {
      patches.push({
        field: bugFields.components.referenceName,
        value: draft.components || null,
      });
    }
    if (bugFields.rcaDescription && draft.rcaDescription !== original.rcaDescription) {
      patches.push({
        field: bugFields.rcaDescription.referenceName,
        value: draft.rcaDescription,
      });
    }
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
  const isBug = wiType === 'Bug';
  const createdBy = task.workItem.fields['System.CreatedBy'] ?? null;

  const baseOriginal = useMemo(() => toDraft(task), [task]);
  const [draft, setDraft] = useState<Draft>(baseOriginal);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ActivityTab>('comments');

  // Bug-only custom fields aren't in the taskboard batch payload — fetch the full
  // work item + the Bug field schema (for allowedValues) on open. Reference names
  // vary by process template so we match by display name.
  const typeFields = useWorkItemTypeFields(wiType, open && isBug);
  const full = useWorkItemFull(task.workItem.id, open && isBug);

  const bugFields = useMemo<BugFieldMap | null>(() => {
    if (!isBug || !typeFields.data) return null;
    // Case- and whitespace-insensitive. Also accept a name ending in the target
    // (e.g. match bare "Environment" against "Digital Platforms Environment")
    // so the form labels in ADO don't have to match the backing field name.
    const norm = (s: string) => s.trim().toLowerCase();
    const findBy = (target: string) => {
      const n = norm(target);
      const exact = typeFields.data!.find((f) => norm(f.name) === n);
      if (exact) return exact;
      return typeFields.data!.find((f) => norm(f.name).endsWith(' ' + n)) ?? null;
    };
    return {
      bugHotfix: findBy(BUG_FIELD_DISPLAY_NAMES.bugHotfix),
      components: findBy(BUG_FIELD_DISPLAY_NAMES.components),
      environment: findBy(BUG_FIELD_DISPLAY_NAMES.environment),
      rca: findBy(BUG_FIELD_DISPLAY_NAMES.rca),
      rcaDescription: findBy(BUG_FIELD_DISPLAY_NAMES.rcaDescription),
    };
  }, [isBug, typeFields.data]);

  type CustomOriginal = Pick<
    Draft,
    'bugHotfix' | 'components' | 'environment' | 'rca' | 'rcaDescription'
  >;
  const customOriginal = useMemo<CustomOriginal | null>(() => {
    if (!isBug || !full.data || !bugFields) return null;
    const f = full.data.fields;
    return {
      bugHotfix: asString(
        bugFields.bugHotfix ? f[bugFields.bugHotfix.referenceName] : '',
      ),
      components: asString(
        bugFields.components ? f[bugFields.components.referenceName] : '',
      ),
      environment: splitTags(
        asString(bugFields.environment ? f[bugFields.environment.referenceName] : ''),
      ),
      rca: asString(bugFields.rca ? f[bugFields.rca.referenceName] : ''),
      rcaDescription: asString(
        bugFields.rcaDescription ? f[bugFields.rcaDescription.referenceName] : '',
      ),
    };
  }, [isBug, full.data, bugFields]);

  const original = useMemo<Draft>(
    () =>
      customOriginal
        ? {
            ...baseOriginal,
            bugHotfix: customOriginal.bugHotfix,
            components: customOriginal.components,
            environment: customOriginal.environment,
            rca: customOriginal.rca,
            rcaDescription: customOriginal.rcaDescription,
          }
        : baseOriginal,
    [baseOriginal, customOriginal],
  );

  // Reset draft whenever the modal is (re)opened for a task. We intentionally depend
  // on baseOriginal (not `original`): if we keyed on `original`, the custom-field
  // fetch resolving would reset any edits the user already made.
  useEffect(() => {
    setDraft(baseOriginal);
    setError(null);
  }, [baseOriginal, open]);

  // One-shot hydration: when the Bug custom-field values arrive, merge them into the
  // draft. Ref-guarded so the user doesn't get clobbered if they've edited something.
  const customHydrated = useRef<number | null>(null);
  useEffect(() => {
    if (!open) {
      customHydrated.current = null;
      return;
    }
    if (!customOriginal) return;
    if (customHydrated.current === task.workItem.id) return;
    customHydrated.current = task.workItem.id;
    setDraft((d) => ({
      ...d,
      bugHotfix: customOriginal.bugHotfix,
      components: customOriginal.components,
      environment: customOriginal.environment,
      rca: customOriginal.rca,
      rcaDescription: customOriginal.rcaDescription,
    }));
  }, [open, customOriginal, task.workItem.id]);

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

  const fullKey = useMemo(
    () => ['workitem-full', projectId, task.workItem.id] as const,
    [projectId, task.workItem.id],
  );

  const dirty =
    draft.title !== original.title ||
    draft.state !== original.state ||
    (draft.assignee?.uniqueName ?? null) !== (original.assignee?.uniqueName ?? null) ||
    draft.storyPoints !== original.storyPoints ||
    !tagsEqual(draft.tags, original.tags) ||
    draft.description !== original.description ||
    draft.bugHotfix !== original.bugHotfix ||
    draft.components !== original.components ||
    draft.rca !== original.rca ||
    draft.rcaDescription !== original.rcaDescription ||
    !tagsEqual(draft.environment, original.environment);

  const save = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error('Missing project');
      const { patches, error } = buildPatches(original, draft, pointsField, bugFields);
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
      // Also patch the full-workitem cache so custom-field edits survive a
      // modal close/reopen without waiting for the refetch.
      const prevFull = queryClient.getQueryData<AdoWorkItem>(fullKey);
      if (prevFull && bugFields) {
        queryClient.setQueryData<AdoWorkItem>(fullKey, {
          ...prevFull,
          fields: {
            ...prevFull.fields,
            ...(bugFields.bugHotfix && {
              [bugFields.bugHotfix.referenceName]: draft.bugHotfix || undefined,
            }),
            ...(bugFields.components && {
              [bugFields.components.referenceName]: draft.components || undefined,
            }),
            ...(bugFields.rca && {
              [bugFields.rca.referenceName]: draft.rca || undefined,
            }),
            ...(bugFields.rcaDescription && {
              [bugFields.rcaDescription.referenceName]: draft.rcaDescription || undefined,
            }),
            ...(bugFields.environment && {
              [bugFields.environment.referenceName]: draft.environment.length
                ? joinTags(draft.environment)
                : undefined,
            }),
          },
        });
      }
      return { prev, prevFull };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev);
      if (ctx?.prevFull) queryClient.setQueryData(fullKey, ctx.prevFull);
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
      queryClient.invalidateQueries({ queryKey: fullKey });
      onClose();
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = buildPatches(original, draft, pointsField, bugFields);
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
      width={980}
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
          <CopyLinkButton workItemId={task.workItem.id} />
          <OpenLinkButton workItemId={task.workItem.id} />
        </span>
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

          {isBug && bugFields?.rcaDescription && (
            <Section label="RCA Description">
              <DescriptionField
                value={draft.rcaDescription}
                onChange={(html) =>
                  setDraft((d) => ({ ...d, rcaDescription: html }))
                }
                placeholder="Add root-cause detail…"
              />
            </Section>
          )}

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

        <aside className="w-[300px] shrink-0 overflow-y-auto border-l border-white/[0.06] bg-white/[0.015] px-4 py-4 space-y-4">
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
          <SidebarField label="Created by">
            <CreatedByRow identity={createdBy} />
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
          {isBug && (
            <BugCustomFields
              draft={draft}
              setDraft={setDraft}
              bugFields={bugFields}
              loading={
                !customOriginal &&
                !typeFields.error &&
                !full.error &&
                (typeFields.isLoading || full.isLoading)
              }
              error={typeFields.error ?? full.error ?? null}
            />
          )}
          <SidebarField label="Time tracking">
            <div className="space-y-3">
              <TimeTracking
                workItemId={task.workItem.id}
                projectId={projectId}
                currentCompleted={
                  task.workItem.fields['Microsoft.VSTS.Scheduling.CompletedWork'] ?? 0
                }
                queryKey={queryKey}
              />
              <TimeContributors
                workItemId={task.workItem.id}
                projectId={projectId}
                enabled={open}
              />
            </div>
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

/** Read-only companion to the AssigneePicker button — same shape, same avatar, but
 *  no chevron, no popover, and muted enough that it doesn't read as clickable. */
function CreatedByRow({ identity }: { identity: AdoIdentity | null }) {
  return (
    <div
      className={cn(
        'w-full h-8 flex items-center gap-2 rounded-md px-2.5 text-[13px]',
        'bg-white/[0.02] border border-white/[0.06] text-zinc-300',
      )}
    >
      <Avatar identity={identity ?? undefined} size="sm" />
      <span className="truncate flex-1">
        {identity?.displayName ?? 'Unknown'}
      </span>
    </div>
  );
}

/** Bug-only custom fields block. Renders a loading state until the type-field schema
 *  AND the full work item payload have both landed — otherwise we'd flash empty
 *  pickers or not know the field reference names to write to. */
function BugCustomFields({
  draft,
  setDraft,
  bugFields,
  loading,
  error,
}: {
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  bugFields: BugFieldMap | null;
  loading: boolean;
  error: unknown;
}) {
  if (loading) {
    return (
      <>
        <SidebarField label="Bug / Hotfix">
          <LoadingRow />
        </SidebarField>
        <SidebarField label="Environment">
          <LoadingRow />
        </SidebarField>
        <SidebarField label="Components">
          <LoadingRow />
        </SidebarField>
        <SidebarField label="Root cause">
          <LoadingRow />
        </SidebarField>
      </>
    );
  }
  if (error) {
    return (
      <SidebarField label="Bug fields">
        <div className="text-[11px] text-red-300/80">
          Couldn't load Bug field schema.
        </div>
      </SidebarField>
    );
  }
  return (
    <>
      {bugFields?.bugHotfix && (
        <SidebarField label="Bug / Hotfix">
          <PicklistPicker
            value={draft.bugHotfix}
            options={bugFields.bugHotfix.allowedValues ?? []}
            onChange={(v) => setDraft((d) => ({ ...d, bugHotfix: v }))}
          />
        </SidebarField>
      )}
      {bugFields?.environment && (
        <SidebarField label="Environment">
          <MultiPicklistPicker
            values={draft.environment}
            options={bugFields.environment.allowedValues ?? []}
            onChange={(v) => setDraft((d) => ({ ...d, environment: v }))}
            placeholder={
              (bugFields.environment.allowedValues ?? []).length === 0
                ? 'No values defined in ADO'
                : 'None'
            }
          />
        </SidebarField>
      )}
      {bugFields?.components && (
        <SidebarField label="Components">
          <PicklistPicker
            value={draft.components}
            options={bugFields.components.allowedValues ?? []}
            onChange={(v) => setDraft((d) => ({ ...d, components: v }))}
          />
        </SidebarField>
      )}
      {bugFields?.rca && (
        <SidebarField label="Root cause">
          <PicklistPicker
            value={draft.rca}
            options={bugFields.rca.allowedValues ?? []}
            onChange={(v) => setDraft((d) => ({ ...d, rca: v }))}
          />
        </SidebarField>
      )}
    </>
  );
}

function LoadingRow() {
  return (
    <div className="h-8 rounded-md bg-white/[0.02] border border-white/[0.06] animate-pulse" />
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
    if (!Number.isFinite(n) || n <= 0) {
      setErr('Enter a positive number of hours');
      return;
    }
    setErr(null);
    log.mutate(n);
  }

  const disabled = log.isPending || !input;

  return (
    <div className="space-y-2">
      <form onSubmit={handleAdd} className="relative">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600 text-[13px] mono">
          +
        </span>
        <Input
          type="text"
          inputMode="decimal"
          pattern="[0-9]*\.?[0-9]*"
          value={input}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '' || POSITIVE_NUMBER_RE.test(v)) setInput(v);
          }}
          onKeyDown={(e) => {
            // Block the 'e', 'E', '+', '-' keys that type="number" normally allows
            // through even in modern browsers with inputMode decimal.
            if (e.key === 'e' || e.key === 'E' || e.key === '+' || e.key === '-') {
              e.preventDefault();
            }
          }}
          placeholder="0"
          className="h-8 pl-6 pr-14 text-[13px] mono"
        />
        <span className="pointer-events-none absolute right-10 top-1/2 -translate-y-1/2 text-zinc-600 text-[11px]">
          h
        </span>
        <button
          type="submit"
          title="Log"
          aria-label="Log time"
          disabled={disabled}
          className={cn(
            'absolute right-1 top-1/2 -translate-y-1/2 inline-flex items-center justify-center',
            'h-6 w-7 rounded',
            'bg-white/[0.08] text-zinc-100 lit-top',
            'hover:bg-white/[0.14] hover:text-white',
            'disabled:opacity-40 disabled:hover:bg-white/[0.08]',
            'transition-colors',
          )}
        >
          {log.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
        </button>
      </form>
      {err && <div className="text-[11px] text-red-300/80 mono">{err}</div>}
    </div>
  );
}
