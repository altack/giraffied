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
  ChevronRight,
  ExternalLink,
  Eye,
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
  uploadAttachment,
} from '@/ado/endpoints';
import type {
  AdoIdentity,
  AdoTaskboardColumn,
  AdoWorkItem,
} from '@/ado/types';
import type { TaskboardData, TaskOnBoard } from '@/ado/hooks/useTaskboard';
import { useComments } from '@/ado/hooks/useComments';
import { useOrgFields } from '@/ado/hooks/useOrgFields';
import { useWorkItemFull } from '@/ado/hooks/useWorkItemFull';
import { useWorkItemStates } from '@/ado/hooks/useWorkItemStates';
import { useWorkItemTypeFields } from '@/ado/hooks/useWorkItemTypeFields';
import { useWorkItemTypeLayout } from '@/ado/hooks/useWorkItemTypeLayout';
import { buildFormDescriptor, type FormControl } from '@/ado/form';
import { useSettings } from '@/state/settings.store';
import { useToasts } from '@/state/toasts.store';
import { cn } from '@/lib/cn';
import { AssigneePicker } from './AssigneePicker';
import { Avatar } from './Avatar';
import { CommentsPanel } from './CommentsPanel';
import { CopyLinkButton, workItemUrl } from './CopyLinkButton';
import { OpenLinkButton } from './OpenLinkButton';
import { DescriptionField } from './DescriptionField';
import { HistoryPanel } from './HistoryPanel';
import { TimeContributors } from './TimeContributors';
import { WorkLogPanel } from './WorkLogPanel';
import { FieldRow } from './widgets';
import type { DraftValue } from './widgets/types';
import {
  buildInitialDraft,
  diffDraft,
  validateDraft,
  type DraftRecord,
} from './form-state';
import { PicklistPicker } from './PicklistPicker';
import { PinButton } from './PinButton';
import { resolveDefaultPins } from './default-pins';
import { usePinnedFields, effectivePins } from '@/state/pinnedFields.store';
import { filenameFromAttachmentUrl, newAttachmentUrls } from './attachments';
import type { UploadedAttachment } from './DescriptionEditor.lazy';
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

/** Structural draft — the fields the modal renders with dedicated widgets that
 *  live *outside* the layout-driven generic form (title headline, state dropdown
 *  tied to the board columns, assignee picker with board-assignee default,
 *  points auto-selection across Effort/Size/StoryPoints, inline Tags chips,
 *  rich Description). Everything else comes from the discovered FormDescriptor
 *  and lives in the `layoutDraft` record. */
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
  /** When true, disables every edit affordance — inputs, composers, pin
   *  toggles, the Save button — and shows a banner explaining why. Used by
   *  `ExternalWorkItemModal` when opening a search result that lives in a
   *  different project than the current board, since every write endpoint in
   *  this modal assumes the current project path. */
  readOnly?: boolean;
  /** Optional project name of the work item (e.g. `System.TeamProject` when
   *  different from the current board's project). Shown in the read-only
   *  banner so the user knows which project owns the item. */
  readOnlyProjectName?: string;
}

export function WorkItemModal({
  task,
  columns,
  open,
  onClose,
  iterationId,
  boardAssignees,
  readOnly = false,
  readOnlyProjectName,
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
  const createdBy = task.workItem.fields['System.CreatedBy'] ?? null;

  const original = useMemo(() => toDraft(task), [task]);
  const [draft, setDraft] = useState<Draft>(original);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ActivityTab>('comments');

  // Form-layout discovery: the fields the team configured on this work-item type.
  // These three fetches drive the generic layout-driven form. Running them for
  // every work-item type (not just Bug) so Tasks/Stories/PBIs also pick up any
  // Repro Steps / Acceptance Criteria / etc that are on their ADO forms.
  const orgFields = useOrgFields();
  const typeFields = useWorkItemTypeFields(wiType, open);
  const layout = useWorkItemTypeLayout(wiType, open);
  const full = useWorkItemFull(task.workItem.id, open);
  // Build the FormDescriptor that drives generic field rendering. Requires both
  // the layout schema and the org-level field registry; type-level allowedValues
  // are merged in when available (picklists without them render with an empty
  // popover — fine, just unusable until the data lands).
  const descriptor = useMemo(() => {
    if (!layout.data || !orgFields.data) return null;
    const typeMap = new Map(
      (typeFields.data ?? []).map((f) => [f.referenceName, f]),
    );
    return buildFormDescriptor(layout.data, orgFields.data.byRef, typeMap);
  }, [layout.data, orgFields.data, typeFields.data]);

  const allControls = useMemo<FormControl[]>(
    () =>
      descriptor
        ? [...descriptor.mainGroups, ...descriptor.sidebarGroups].flatMap(
            (g) => g.controls,
          )
        : [],
    [descriptor],
  );

  // Sidebar-only controls feed the pinning UI; HTML/long groups stay in the main
  // area regardless of pin state.
  const sidebarControls = useMemo<FormControl[]>(
    () =>
      descriptor ? descriptor.sidebarGroups.flatMap((g) => g.controls) : [],
    [descriptor],
  );

  const defaultPins = useMemo(
    () => resolveDefaultPins(wiType, sidebarControls),
    [wiType, sidebarControls],
  );

  const pinEntry = usePinnedFields((s) => s.byType[wiType]);
  const pinField = usePinnedFields((s) => s.pin);
  const unpinField = usePinnedFields((s) => s.unpin);
  const pinnedSet = useMemo(
    () => effectivePins(wiType, defaultPins, pinEntry),
    [wiType, defaultPins, pinEntry],
  );

  // Original values for the layout-driven fields, derived from the full
  // work-item payload. Null until the fetch lands — the dirty check treats that
  // as "not yet hydrated" so Save stays disabled.
  const layoutOriginal = useMemo<DraftRecord | null>(() => {
    if (!full.data || allControls.length === 0) return null;
    return buildInitialDraft(allControls, full.data.fields);
  }, [full.data, allControls]);

  const [layoutDraft, setLayoutDraft] = useState<DraftRecord>({});

  // Reset the structural draft whenever the modal (re)opens for a task. Depends
  // on `original` (the pure structural snapshot) so that later hydration of the
  // layout fields doesn't clobber user edits in the structural area.
  useEffect(() => {
    setDraft(original);
    setError(null);
  }, [original, open]);

  // One-shot hydration of layout draft once the layout + full-item fetches land.
  // Ref-guarded per work-item id so resolving fetches after the user has already
  // edited a layout field don't clobber those edits.
  const layoutHydrated = useRef<number | null>(null);
  useEffect(() => {
    if (!open) {
      layoutHydrated.current = null;
      setLayoutDraft({});
      return;
    }
    if (!layoutOriginal) return;
    if (layoutHydrated.current === task.workItem.id) return;
    layoutHydrated.current = task.workItem.id;
    setLayoutDraft(layoutOriginal);
  }, [open, layoutOriginal, task.workItem.id]);

  // Preferred source: the full state list from the work-item-type definition,
  // which includes un-mapped states ("New", "Approved", …) that the column
  // config wouldn't expose. Falls back to the column-derived set during the
  // fetch or if it errors — so the dropdown always has *something*.
  const statesFromType = useWorkItemStates(wiType, open);
  const stateOptions = useMemo(() => {
    if (statesFromType.data && statesFromType.data.length > 0) {
      const out = [...statesFromType.data];
      if (original.state && !out.includes(original.state)) out.push(original.state);
      return out;
    }
    return stateOptionsFor(columns, wiType, original.state);
  }, [statesFromType.data, columns, wiType, original.state]);

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

  const layoutPatches = useMemo(
    () =>
      layoutOriginal ? diffDraft(allControls, layoutOriginal, layoutDraft) : [],
    [allControls, layoutOriginal, layoutDraft],
  );

  const structuralDirty =
    draft.title !== original.title ||
    draft.state !== original.state ||
    (draft.assignee?.uniqueName ?? null) !== (original.assignee?.uniqueName ?? null) ||
    draft.storyPoints !== original.storyPoints ||
    !tagsEqual(draft.tags, original.tags) ||
    draft.description !== original.description;

  const dirty = structuralDirty || layoutPatches.length > 0;

  // Scoped upload callback for the description + any layout HTML editor.
  // Stable per projectId so the editor doesn't churn on each render.
  const uploadFile = useCallback(
    async (file: File): Promise<UploadedAttachment> => {
      if (!projectId) throw new Error('Missing project');
      const { url } = await uploadAttachment(projectId, file.name, file);
      return {
        url,
        name: file.name,
        kind: file.type.startsWith('video/') ? 'video' : 'image',
      };
    },
    [projectId],
  );

  // Payload is computed synchronously at submit time, not inside mutationFn.
  // onMutate's optimistic `setQueryData(fullKey, …)` immediately merges the
  // layoutPatches into `full.data`; React flushes that before the async
  // mutationFn body runs, which causes `layoutOriginal` (a useMemo on
  // `full.data`) to catch up with `layoutDraft`, which drops `layoutPatches`
  // to [] in the next render — and the mutationFn's closure then sees empty
  // patches, hits the `all.length === 0` short-circuit, and no request ever
  // fires. Passing the snapshot as mutate variables keeps the request payload
  // stable through the React flush.
  interface SaveVariables {
    patches: AdoFieldPatch[];
    addAttachments: { url: string; name: string }[];
    snapshotDraft: Draft;
    snapshotLayoutPatches: AdoFieldPatch[];
  }

  const save = useMutation({
    mutationFn: async ({ patches, addAttachments }: SaveVariables) => {
      if (!projectId) throw new Error('Missing project');
      if (patches.length === 0) return null;
      return patchWorkItemFields(
        projectId,
        task.workItem.id,
        patches,
        addAttachments.length > 0 ? addAttachments : undefined,
      );
    },
    onMutate: ({ snapshotDraft, snapshotLayoutPatches }: SaveVariables) => {
      const prev = queryClient.getQueryData<TaskboardData>(queryKey);
      if (prev) {
        queryClient.setQueryData<TaskboardData>(
          queryKey,
          applyDraftToTaskboard(
            prev,
            task.workItem.id,
            wiType,
            snapshotDraft,
            pointsField,
          ),
        );
      }
      // Full-workitem cache gets every layout patch so modal close/reopen shows
      // the edited value before the refetch lands.
      const prevFull = queryClient.getQueryData<AdoWorkItem>(fullKey);
      if (prevFull && snapshotLayoutPatches.length > 0) {
        const merged = { ...prevFull.fields };
        for (const p of snapshotLayoutPatches) {
          merged[p.field] = p.value ?? undefined;
        }
        queryClient.setQueryData<AdoWorkItem>(fullKey, {
          ...prevFull,
          fields: merged,
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
      useToasts.getState().push(`Saved #${task.workItem.id}`);
      onClose();
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (readOnly) return;
    setError(null);
    const { patches: structuralPatches, error } = buildPatches(
      original,
      draft,
      pointsField,
    );
    if (error) {
      setError(error);
      return;
    }
    const { error: vErr } = validateDraft(allControls, layoutDraft);
    if (vErr) {
      setError(vErr);
      return;
    }
    const all: AdoFieldPatch[] = [...structuralPatches, ...layoutPatches];
    if (all.length === 0) {
      onClose();
      return;
    }

    // Attachment URLs: description + every changed HTML layout widget,
    // filtered against the relations already on the work item.
    const added: string[] = newAttachmentUrls(
      original.description,
      draft.description,
    );
    for (const p of layoutPatches) {
      const ctl = allControls.find((c) => c.referenceName === p.field);
      if (!ctl || ctl.widget !== 'html') continue;
      const oldVal = layoutOriginal?.[p.field];
      const oldStr = typeof oldVal === 'string' ? oldVal : '';
      const newStr = typeof p.value === 'string' ? p.value : '';
      added.push(...newAttachmentUrls(oldStr, newStr));
    }
    const existingRelUrls = new Set(
      (full.data?.relations ?? [])
        .filter((r) => r.rel === 'AttachedFile')
        .map((r) => r.url),
    );
    const addAttachments = Array.from(new Set(added))
      .filter((u) => !existingRelUrls.has(u))
      .map((url) => ({ url, name: filenameFromAttachmentUrl(url) }));

    save.mutate({
      patches: all,
      addAttachments,
      snapshotDraft: draft,
      snapshotLayoutPatches: layoutPatches,
    });
  }

  function setLayoutField(ref: string, value: DraftValue) {
    setLayoutDraft((d) => ({ ...d, [ref]: value }));
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
        // data-no-drag: the header's pointer-down handler looks for this on any
        // ancestor of the click target and skips drag — so the title glyphs and
        // the gaps between them don't hijack what should be a text selection.
        // select-text overrides the header's `select-none`. px-1 -mx-1 is a 4px
        // safe zone on each side so a click just off the glyphs still counts
        // as "inside the title" instead of bubbling to the drag handler.
        <span
          data-no-drag
          className="inline-flex items-center gap-1.5 select-text cursor-text px-1 -mx-1"
        >
          <span
            className="h-1.5 w-1.5 rounded-full shrink-0"
            style={{ backgroundColor: type.dot }}
            aria-hidden
          />
          <span className="text-[var(--color-ink-muted)] shrink-0">{type.label}</span>
          <span className="text-[var(--color-ink-dim)] shrink-0">·</span>
          <span className="mono text-[var(--color-ink-muted)] shrink-0">#{task.workItem.id}</span>
          <CopyLinkButton workItemId={task.workItem.id} />
          <OpenLinkButton workItemId={task.workItem.id} />
        </span>
      }
      footer={
        <>
          {error && !readOnly && (
            // key={error} remounts on each new error string so jfd-shake
            // re-fires. Same-message-twice-in-a-row won't re-shake, which
            // is the correct behaviour for retry→same-failure — the user
            // already saw the shake once.
            <div
              key={error}
              className="jfd-shake mr-auto flex items-center gap-1.5 text-[11px] text-red-300/90"
            >
              <AlertCircle className="h-3.5 w-3.5" />
              <span className="mono truncate max-w-[360px]">{error}</span>
            </div>
          )}
          <Button variant="ghost" size="sm" type="button" onClick={onClose}>
            {readOnly ? 'Close' : 'Cancel'}
          </Button>
          {!readOnly && (
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
          )}
        </>
      }
    >
      <div className="flex h-full min-h-0">
        <form
          id="workitem-form"
          onSubmit={handleSubmit}
          className="flex-1 min-w-0 overflow-y-auto px-5 py-4 space-y-4"
        >
          {readOnly && (
            <ReadOnlyBanner
              projectName={readOnlyProjectName}
              workItemId={task.workItem.id}
            />
          )}
          <textarea
            autoFocus={!readOnly}
            readOnly={readOnly}
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            rows={1}
            className={cn(
              'w-full field-sizing-content rounded-md px-3 py-2 resize-none',
              'text-[17px] leading-[1.3] font-medium text-[var(--color-ink)]',
              'bg-transparent border border-transparent',
              !readOnly &&
                'hover:bg-[var(--color-overlay-soft)] hover:border-[var(--color-hairline)] focus-visible:outline-none focus-visible:bg-[var(--color-overlay-1)] focus-visible:border-indigo-400/30 focus-visible:ring-2 focus-visible:ring-indigo-400/15',
              readOnly && 'cursor-default',
              'transition-colors duration-150',
            )}
          />

          {/* Render Description only when the work-item type's form actually
              has it. Some process templates omit Description on Bug in favor
              of Repro Steps / System Info / Acceptance Criteria — surfacing
              an empty Description in those cases would just be confusing.
              While the descriptor is loading we default to showing it (the
              vast majority of WITs include Description). */}
          {(!descriptor || descriptor.hasDescription) && (
            <Section label="Description">
              <DescriptionField
                value={draft.description}
                onChange={(html) => setDraft((d) => ({ ...d, description: html }))}
                uploadFile={uploadFile}
                placeholder="Add a description…"
                readOnly={readOnly}
              />
            </Section>
          )}

          {/* Show skeleton until BOTH the descriptor and the full work-item
              payload are ready. Rendering LayoutGroups before `full.data`
              lands would paint empty HTML widgets under their labels — the
              draft is still `{}` because `layoutOriginal` hasn't hydrated
              yet (see the useEffect downstream). */}
          {(layout.isLoading || full.isLoading) &&
            (!descriptor || !layoutOriginal) && (
              <div className="space-y-2">
                <div className="h-3 w-28 rounded bg-[var(--color-overlay-1)] animate-pulse" />
                <div className="h-24 rounded-md bg-[var(--color-overlay-soft)] border border-[var(--color-hairline)] animate-pulse" />
              </div>
            )}
          {descriptor &&
            layoutOriginal &&
            descriptor.mainGroups.map((group) => (
              <LayoutGroup
                key={group.label + group.controls[0]?.referenceName}
                group={group}
                draft={layoutDraft}
                onChange={setLayoutField}
                uploadFile={uploadFile}
                disabled={readOnly}
              />
            ))}

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
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
              {/* key={tab} remounts the wrapper on tab switch so jfd-tab-in
                  runs its short fade+lift. The tab children were already
                  conditionally rendered (they unmount/remount on switch), so
                  adding the key doesn't change any preservation behavior. */}
              <div key={tab} className="jfd-tab-in">
                {tab === 'comments' && (
                  <CommentsPanel
                    workItemId={task.workItem.id}
                    enabled={open}
                    readOnly={readOnly}
                  />
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
          </div>
        </form>

        <aside className="w-[300px] shrink-0 overflow-y-auto border-l border-[var(--color-hairline)] bg-[var(--color-overlay-soft)] px-4 py-4 space-y-4">
          <SidebarField label="Status">
            <PicklistPicker
              value={draft.state}
              options={stateOptions}
              onChange={(v) => setDraft((d) => ({ ...d, state: v }))}
              clearable={false}
              disabled={readOnly}
              placeholder={statesFromType.isLoading ? 'Loading…' : '—'}
            />
          </SidebarField>
          <SidebarField label="Assignee">
            <AssigneePicker
              value={draft.assignee}
              onChange={(a) => setDraft((d) => ({ ...d, assignee: a }))}
              boardAssignees={boardAssignees}
              disabled={readOnly}
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
              disabled={readOnly}
              placeholder="—"
              className="w-24"
            />
          </SidebarField>
          <SidebarField label="Tags">
            <TagsEditor
              tags={draft.tags}
              onChange={(tags) => setDraft((d) => ({ ...d, tags }))}
              readOnly={readOnly}
            />
          </SidebarField>
          <SidebarField label="Time tracking">
            <div className="space-y-3">
              {/* Hide the quick-log form in read-only mode — a disabled form
                  that silently ignores Enter is worse UX than not rendering
                  it. Keep the contributors breakdown: it's informative. */}
              {!readOnly && (
                <TimeTracking
                  workItemId={task.workItem.id}
                  projectId={projectId}
                  currentCompleted={
                    task.workItem.fields['Microsoft.VSTS.Scheduling.CompletedWork'] ?? 0
                  }
                  queryKey={queryKey}
                />
              )}
              <TimeContributors
                workItemId={task.workItem.id}
                projectId={projectId}
                enabled={open}
              />
            </div>
          </SidebarField>
          {(layout.isLoading || full.isLoading) && !descriptor && (
            <>
              <SidebarDivider />
              <SidebarLoadingBlock />
            </>
          )}
          {descriptor && layoutOriginal && pinnedSet.size > 0 && (
            <>
              <SidebarDivider />
              <div className="space-y-4">
                {sidebarControls
                  .filter((c) => pinnedSet.has(c.referenceName))
                  .map((control) => (
                    <div key={control.referenceName} className="group">
                      <FieldRow
                        control={control}
                        value={layoutDraft[control.referenceName] ?? null}
                        onChange={(v) =>
                          setLayoutField(control.referenceName, v)
                        }
                        uploadFile={uploadFile}
                        disabled={readOnly}
                        action={
                          !readOnly && (
                            <PinButton
                              pinned
                              label={control.displayName}
                              onToggle={() =>
                                unpinField(wiType, control.referenceName)
                              }
                            />
                          )
                        }
                      />
                    </div>
                  ))}
              </div>
            </>
          )}
          {descriptor &&
            layoutOriginal &&
            (() => {
              const moreGroups = descriptor.sidebarGroups
                .map((g) => ({
                  ...g,
                  controls: g.controls.filter(
                    (c) => !pinnedSet.has(c.referenceName),
                  ),
                }))
                .filter((g) => g.controls.length > 0);
              const moreCount = moreGroups.reduce(
                (acc, g) => acc + g.controls.length,
                0,
              );
              if (moreCount === 0) return null;
              return (
                <>
                  <SidebarDivider />
                  <MoreFieldsSection count={moreCount}>
                    <div className="space-y-4">
                      {moreGroups.map((group) => (
                        <LayoutGroup
                          key={
                            group.label + group.controls[0]?.referenceName
                          }
                          group={group}
                          draft={layoutDraft}
                          onChange={setLayoutField}
                          uploadFile={uploadFile}
                          disabled={readOnly}
                          renderAction={
                            readOnly
                              ? undefined
                              : (control) => (
                                  <PinButton
                                    pinned={false}
                                    label={control.displayName}
                                    onToggle={() =>
                                      pinField(wiType, control.referenceName)
                                    }
                                  />
                                )
                          }
                        />
                      ))}
                    </div>
                  </MoreFieldsSection>
                </>
              );
            })()}
          {(layout.error || full.error) && (
            <>
              <SidebarDivider />
              <div className="text-[11px] text-red-300/80">
                Couldn't load form layout. Core fields still editable.
              </div>
            </>
          )}
        </aside>
      </div>
    </DraggableModal>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
        {label}
      </div>
      {children}
    </div>
  );
}

/** Sits at the top of the modal form when the opened item lives in a
 *  different project than the current board. Explains why edits would fail
 *  and links to the native ADO UI where edits actually work. Uses the item's
 *  own project name to build the URL — NOT the board's current projectName,
 *  which is the whole reason the item is read-only in the first place. */
function ReadOnlyBanner({
  projectName,
  workItemId,
}: {
  projectName: string | undefined;
  workItemId: number;
}) {
  const org = useSettings((s) => s.org);
  const url = org && projectName ? workItemUrl(org, projectName, workItemId) : null;
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md px-3 py-2 text-[12px]',
        'bg-amber-400/[0.06] border border-amber-400/20 text-amber-100/90',
        'lit-top',
      )}
      role="status"
    >
      <Eye className="h-3.5 w-3.5 shrink-0 text-amber-300/80" aria-hidden />
      <span className="min-w-0 flex-1">
        Read-only —{' '}
        {projectName ? (
          <>
            this item lives in <span className="text-amber-100 font-medium">{projectName}</span>.
          </>
        ) : (
          'this item lives in another project.'
        )}{' '}
        Open it in Azure DevOps to make changes.
      </span>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'inline-flex items-center gap-1 h-6 px-2 rounded text-[11px] font-medium shrink-0',
            'bg-[var(--color-overlay-1)] border border-[var(--color-hairline-strong)] text-[var(--color-ink)]',
            'hover:bg-[var(--color-overlay-2)] hover:border-[var(--color-hairline-loud)]',
            'transition-colors duration-100',
          )}
        >
          <ExternalLink className="h-3 w-3" />
          Open
        </a>
      )}
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
        'bg-[var(--color-overlay-soft)] border border-[var(--color-hairline)] text-[var(--color-ink)]',
      )}
    >
      <Avatar identity={identity ?? undefined} size="sm" />
      <span className="truncate flex-1">
        {identity?.displayName ?? 'Unknown'}
      </span>
    </div>
  );
}

/** Render one layout-driven group (with its label header) as a stack of FieldRows.
 *  Shared between the main area (HTML/long groups) and sidebar (short fields).
 *  Empty groups never reach this component — the descriptor already filters those
 *  out. */
function LayoutGroup({
  group,
  draft,
  onChange,
  renderAction,
  uploadFile,
  disabled = false,
}: {
  group: import('@/ado/form').FormGroup;
  draft: DraftRecord;
  onChange: (ref: string, value: DraftValue) => void;
  /** Per-row trailing action (typically the Pin/PinOff button). Wrapped in a
   *  `group` container so the action can hover-reveal via `group-hover:*`. */
  renderAction?: (control: FormControl) => React.ReactNode;
  uploadFile?: (file: File) => Promise<UploadedAttachment>;
  /** When true, every control in the group renders disabled. */
  disabled?: boolean;
}) {
  // A group whose label echoes its single control's label is just visual noise —
  // ADO's native form renders those as plain sections without a header. Only show
  // the group header when it's meaningfully distinct from the fields inside.
  const showHeader =
    !!group.label &&
    group.controls.length > 1 &&
    !group.controls.some(
      (c) => c.displayName.trim().toLowerCase() === group.label.trim().toLowerCase(),
    );
  return (
    <div className="space-y-3">
      {showHeader && (
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
          {group.label}
        </div>
      )}
      {group.controls.map((control) => (
        <div key={control.referenceName} className="group">
          <FieldRow
            control={control}
            value={draft[control.referenceName] ?? null}
            onChange={(v) => onChange(control.referenceName, v)}
            action={renderAction?.(control)}
            uploadFile={uploadFile}
            disabled={disabled}
          />
        </div>
      ))}
    </div>
  );
}

function SidebarDivider() {
  return <div className="h-px bg-[var(--color-hairline)] -mx-4" />;
}

/** Collapsible "MORE FIELDS (N)" section. Collapsed by default — the whole
 *  point of the pinning UX is to keep the default sidebar quiet and let power
 *  users expand when they need the long tail. */
function MoreFieldsSection({
  count,
  children,
}: {
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'w-full flex items-center gap-1.5 py-1',
          'text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-muted)]',
          'hover:text-[var(--color-ink)] transition-colors',
        )}
      >
        <ChevronRight
          className={cn(
            'h-3 w-3 transition-transform duration-150',
            open && 'rotate-90',
          )}
        />
        <span>More fields</span>
        <span className="mono text-[var(--color-ink-dim)]">({count})</span>
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

function SidebarLoadingBlock() {
  return (
    <>
      <SidebarField label="Loading fields">
        <LoadingRow />
      </SidebarField>
      <SidebarField label="">
        <LoadingRow />
      </SidebarField>
    </>
  );
}

function LoadingRow() {
  return (
    <div className="h-8 rounded-md bg-[var(--color-overlay-soft)] border border-[var(--color-hairline)] animate-pulse" />
  );
}

function SidebarField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
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
  readOnly = false,
}: {
  tags: string[];
  onChange: (next: string[]) => void;
  readOnly?: boolean;
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
        'bg-[var(--color-overlay-soft)] border border-[var(--color-hairline-strong)]',
        !readOnly &&
          'focus-within:border-indigo-400/40 focus-within:ring-2 focus-within:ring-indigo-400/15',
        'transition-colors duration-150',
      )}
    >
      {tags.length === 0 && readOnly && (
        <span className="text-[12px] text-[var(--color-ink-dim)] px-1">No tags</span>
      )}
      {tags.map((tag) => (
        <span
          key={tag}
          className={cn(
            'inline-flex items-center gap-0.5 rounded bg-[var(--color-overlay-1)] py-0.5 text-[11px] text-[var(--color-ink)] lit-top',
            // Extra right padding when the × button isn't there, so the label
            // doesn't sit flush against the rounded edge.
            readOnly ? 'px-2' : 'pl-2 pr-0.5',
            'jfd-chip-in',
          )}
        >
          {tag}
          {!readOnly && (
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
              className="inline-flex items-center justify-center h-4 w-4 rounded text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-overlay-2)] transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}
      {!readOnly && (
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
          className="flex-1 min-w-[80px] bg-transparent text-[12px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-dim)] outline-none px-1 py-0.5"
        />
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
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-ink-dim)] text-[13px] mono">
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
        <span className="pointer-events-none absolute right-10 top-1/2 -translate-y-1/2 text-[var(--color-ink-dim)] text-[11px]">
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
            'bg-[var(--color-overlay-2)] text-[var(--color-ink)] lit-top',
            'hover:bg-[var(--color-overlay-loud)]',
            'disabled:opacity-40 disabled:hover:bg-[var(--color-overlay-2)]',
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
