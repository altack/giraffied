import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
} from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DraggableModal } from '@/components/ui/draggable-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AdoError } from '@/ado/client';
import {
  createWorkItem,
  getTeamFieldValues,
  uploadAttachment,
} from '@/ado/endpoints';
import type {
  AdoFieldValue,
} from '@/ado/endpoints';
import {
  filenameFromAttachmentUrl,
  newAttachmentUrls,
} from './attachments';
import type { UploadedAttachment } from './DescriptionEditor.lazy';
import type {
  AdoIdentity,
  AdoTaskboardColumn,
  AdoTaskboardWorkItem,
  AdoWorkItem,
} from '@/ado/types';
import type {
  Swimlane,
  TaskboardData,
  TaskOnBoard,
} from '@/ado/hooks/useTaskboard';
import { useSettings } from '@/state/settings.store';
import { AssigneePicker } from './AssigneePicker';
import { DescriptionEditor } from './DescriptionEditor';
import { ParentPicker } from './ParentPicker';
import { workItemTypeStyle } from './workItemVisuals';

interface Draft {
  parentId: number | null;
  assignee: AdoIdentity | null;
  title: string;
  description: string;
}

function initialDraft(defaultParentId: number | null): Draft {
  return {
    parentId: defaultParentId,
    assignee: null,
    title: '',
    description: '',
  };
}

interface CreateTaskDialogProps {
  open: boolean;
  onClose: () => void;
  /** Which lane's `+` was clicked. `null` = Everything else (no parent). */
  defaultParentId: number | null;
  /** All parentable rows currently on the board (swimlane rows). */
  swimlanes: Swimlane[];
  iterationPath: string;
  boardAssignees: AdoIdentity[];
  /** Called after a successful create so the cache can graft the new card in. */
  onCreated: (created: AdoWorkItem, parentId: number | null) => void;
}

export function CreateTaskDialog({
  open,
  onClose,
  defaultParentId,
  swimlanes,
  iterationPath,
  boardAssignees,
  onCreated,
}: CreateTaskDialogProps) {
  const projectId = useSettings((s) => s.projectId);
  const teamId = useSettings((s) => s.teamId);
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState<Draft>(() => initialDraft(defaultParentId));
  const [error, setError] = useState<string | null>(null);

  // Scoped upload callback for the description editor. The new task doesn't
  // exist yet, so attachments are uploaded standalone; the URLs end up in the
  // description HTML, and the create call appends them as /relations/- ops in
  // the same JSON-Patch body.
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

  // Reset when the dialog (re)opens from a different lane.
  useEffect(() => {
    if (open) {
      setDraft(initialDraft(defaultParentId));
      setError(null);
    }
  }, [open, defaultParentId]);

  const selectedParent = useMemo(
    () =>
      draft.parentId == null
        ? null
        : swimlanes.find((l) => l.row.id === draft.parentId)?.row ?? null,
    [draft.parentId, swimlanes],
  );

  const create = useMutation({
    mutationFn: async () => {
      if (!projectId || !teamId) throw new Error('Missing project/team');
      const title = draft.title.trim();
      if (!title) throw new Error('Title cannot be empty');

      // Area path: copy from parent when available, else fall back to the team's
      // default. One fetch per create attempt for the unparented case is fine —
      // cached via react-query so repeat "create another"s don't re-hit ADO.
      let areaPath = selectedParent?.fields['System.AreaPath'];
      if (!areaPath) {
        const tf = await queryClient.fetchQuery({
          queryKey: ['teamFieldValues', projectId, teamId],
          queryFn: () => getTeamFieldValues(projectId, teamId),
          staleTime: 60 * 60 * 1000,
        });
        areaPath = tf.defaultValue;
      }

      const fields: Record<string, AdoFieldValue> = {
        'System.Title': title,
        'System.IterationPath': iterationPath,
      };
      if (areaPath) fields['System.AreaPath'] = areaPath;
      if (draft.assignee) {
        fields['System.AssignedTo'] =
          draft.assignee.uniqueName ?? draft.assignee.displayName;
      }
      if (draft.description && draft.description.trim()) {
        fields['System.Description'] = draft.description;
      }

      // Bind any newly-uploaded attachments embedded in the description HTML
      // — without a relation, ADO eventually GCs the orphan blob.
      const newUrls = newAttachmentUrls('', draft.description);
      const addAttachments = newUrls.map((url) => ({
        url,
        name: filenameFromAttachmentUrl(url),
      }));

      return createWorkItem(
        projectId,
        'Task',
        fields,
        selectedParent?.url,
        addAttachments.length > 0 ? addAttachments : undefined,
      );
    },
    onError: (err) => {
      setError(
        err instanceof AdoError
          ? `${err.status} ${err.statusText} — ${err.body.slice(0, 200)}`
          : err instanceof Error
            ? err.message
            : String(err),
      );
    },
  });

  const submit = useCallback(
    async (keepOpen: boolean) => {
      setError(null);
      if (!draft.title.trim()) {
        setError('Title cannot be empty');
        return;
      }
      try {
        const created = await create.mutateAsync();
        onCreated(created, draft.parentId);
        if (keepOpen) {
          // Keep parent + assignee, clear title/description so the next one is
          // ready for immediate typing. Title input stays focused.
          setDraft((d) => ({ ...d, title: '', description: '' }));
        } else {
          onClose();
        }
      } catch {
        // error state handled in onError; keep dialog open so the user can retry.
      }
    },
    [create, draft.parentId, draft.title, onClose, onCreated],
  );

  // Enter in the title input saves + closes; Cmd/Ctrl+Enter saves + keeps open.
  function handleTitleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const keepOpen = e.metaKey || e.ctrlKey;
    void submit(keepOpen);
  }

  const canSave = draft.title.trim().length > 0 && !create.isPending;

  return (
    <DraggableModal
      open={open}
      onClose={onClose}
      width={520}
      heightVh={80}
      title={
        <span
          data-no-drag
          className="inline-flex items-center gap-1.5 select-text cursor-text px-1 -mx-1"
        >
          <span
            className="h-1.5 w-1.5 rounded-full shrink-0"
            style={{ backgroundColor: workItemTypeStyle('Task').dot }}
            aria-hidden
          />
          <span className="text-[var(--color-ink)]">New task</span>
        </span>
      }
      footer={
        <>
          {error && (
            <div className="mr-auto flex items-center gap-1.5 text-[11px] text-red-300/90">
              <AlertCircle className="h-3.5 w-3.5" />
              <span className="mono truncate max-w-[240px]">{error}</span>
            </div>
          )}
          <span className="mr-2 hidden md:inline text-[11px] text-[var(--color-ink-dim)] mono">
            ⏎ save · ⌘⏎ save & create another · Esc cancel
          </span>
          <Button variant="ghost" size="sm" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            type="button"
            disabled={!canSave}
            onClick={() => void submit(false)}
          >
            {create.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Create
          </Button>
        </>
      }
    >
      <div className="px-4 py-4 space-y-3 overflow-y-auto">
        <Field label="Parent">
          <ParentPicker
            value={draft.parentId}
            onChange={(id) => setDraft((d) => ({ ...d, parentId: id }))}
            swimlanes={swimlanes}
          />
        </Field>

        <Field label="Assignee">
          <AssigneePicker
            value={draft.assignee}
            onChange={(a) => setDraft((d) => ({ ...d, assignee: a }))}
            boardAssignees={boardAssignees}
          />
        </Field>

        <Field label="Title">
          <Input
            autoFocus
            value={draft.title}
            onChange={(e) =>
              setDraft((d) => ({ ...d, title: e.target.value }))
            }
            onKeyDown={handleTitleKey}
            placeholder="What needs doing?"
            className="h-9 text-[14px]"
          />
        </Field>

        <Field label="Description">
          <DescriptionEditor
            value={draft.description}
            onChange={(html) => setDraft((d) => ({ ...d, description: html }))}
            uploadFile={uploadFile}
            variant="plain"
            placeholder="Add a description…"
          />
        </Field>
      </div>
    </DraggableModal>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink-muted)]">
        {label}
      </div>
      {children}
    </div>
  );
}

/** Build a TaskOnBoard for the newly-created work item so BoardGrid can splice
 *  it into its lane without waiting for a refetch. Picks the column whose
 *  `mappings.Task` matches the state ADO assigned; if nothing matches, drops the
 *  card into the first column so the user still sees it. */
export function toTaskOnBoard(
  wi: AdoWorkItem,
  columns: AdoTaskboardColumn[],
): TaskOnBoard {
  const state = wi.fields['System.State'] ?? '';
  let column = columns.find((c) => (c.mappings['Task'] ?? '') === state);
  if (!column && columns.length > 0) column = columns[0];
  const taskboard: AdoTaskboardWorkItem = {
    workItemId: wi.id,
    state,
    column: column?.name ?? '',
    columnId: column?.id ?? '',
  };
  return { workItem: wi, taskboard };
}

/** Append a freshly-created task to the right lane of TaskboardData. Used as
 *  the optimistic assimilation after `createWorkItem` returns. */
export function appendCreatedTask(
  data: TaskboardData,
  created: AdoWorkItem,
  parentId: number | null,
): TaskboardData {
  const task = toTaskOnBoard(created, data.columns);
  if (parentId == null) {
    return {
      ...data,
      unparented: [...data.unparented, task],
      totals: { ...data.totals, cards: data.totals.cards + 1 },
    };
  }
  return {
    ...data,
    swimlanes: data.swimlanes.map((lane) =>
      lane.row.id === parentId
        ? { ...lane, tasks: [...lane.tasks, task] }
        : lane,
    ),
    totals: { ...data.totals, cards: data.totals.cards + 1 },
  };
}
