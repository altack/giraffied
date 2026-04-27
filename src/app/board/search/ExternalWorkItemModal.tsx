import { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { AdoIdentity, AdoTaskboardColumn, AdoWorkItem } from '@/ado/types';
import type { TaskOnBoard } from '@/ado/hooks/useTaskboard';
import { useWorkItemFull } from '@/ado/hooks/useWorkItemFull';
import { useSettings } from '@/state/settings.store';
import { WorkItemModal } from '../WorkItemModal';

/** Wrapper that opens the standard work-item modal for an item that wasn't
 *  clicked on the board (search result). Fetches the full item by id and
 *  synthesizes a minimal `TaskOnBoard` — the modal's own data-driven form
 *  handles the fields regardless of whether the item's columnId maps into the
 *  current board's column config.
 *
 *  When the selected item happens to be on the current sprint, the board's
 *  optimistic update path (`applyDraftToTaskboard`) still finds the card by id
 *  and updates it — so the board reflects edits without waiting for the
 *  refetch. When it's not on the sprint, the update is a no-op; onSuccess's
 *  invalidate handles any needed refresh. */
export function ExternalWorkItemModal({
  workItem,
  columns,
  iterationId,
  boardAssignees,
  onClose,
}: {
  workItem: AdoWorkItem;
  columns: AdoTaskboardColumn[];
  iterationId: string | undefined;
  boardAssignees: AdoIdentity[];
  onClose: () => void;
}) {
  const currentProjectName = useSettings((s) => s.projectName);
  const itemProjectName = (workItem.fields['System.TeamProject'] as string | undefined) ?? '';

  // Cross-project detection. Every write path in WorkItemModal (PATCH fields,
  // comments, attachments, status change) bakes in the CURRENT project via
  // `useSettings`, so a save against an item in another project would 404.
  // Switch to read-only rather than letting the user discover this by
  // clicking Save and hitting an error. Same-project or missing-project
  // (defensive) falls through to editable. Case-insensitive compare —
  // ADO project names are typically exact but settings was entered by the
  // user and may differ in casing.
  const readOnly =
    !!currentProjectName &&
    !!itemProjectName &&
    itemProjectName.toLowerCase() !== currentProjectName.toLowerCase();

  const synthesized = useMemo<TaskOnBoard>(
    () => ({
      workItem,
      taskboard: {
        workItemId: workItem.id,
        state: workItem.fields['System.State'] ?? '',
        column: '',
        columnId: '',
      },
    }),
    [workItem],
  );

  return (
    <WorkItemModal
      key={workItem.id}
      task={synthesized}
      columns={columns}
      open
      onClose={onClose}
      iterationId={iterationId ?? ''}
      boardAssignees={boardAssignees}
      readOnly={readOnly}
      readOnlyProjectName={readOnly ? itemProjectName : undefined}
    />
  );
}

/** Variant that fetches the work item on demand. Used when we only have an id
 *  (e.g. the search cache was evicted before the modal mounted). Shows a
 *  minimal blurred loading overlay while the full item loads. */
export function ExternalWorkItemModalLoader({
  workItemId,
  columns,
  iterationId,
  boardAssignees,
  onClose,
}: {
  workItemId: number;
  columns: AdoTaskboardColumn[];
  iterationId: string | undefined;
  boardAssignees: AdoIdentity[];
  onClose: () => void;
}) {
  const full = useWorkItemFull(workItemId, true);

  if (full.isLoading && !full.data) {
    return createPortal(
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-canvas)]/40 backdrop-blur-sm"
        onClick={onClose}
      >
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-[var(--color-surface-2)]/90 backdrop-blur-xl border border-[var(--color-hairline-strong)] lit-top text-[12.5px] text-[var(--color-ink)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading work item…
        </div>
      </div>,
      document.body,
    );
  }

  if (!full.data) {
    // Fetch failed — bail silently (WorkItemModal has its own error UI for
    // subsequent mutations but needs a starting work item to render).
    onClose();
    return null;
  }

  return (
    <ExternalWorkItemModal
      workItem={full.data}
      columns={columns}
      iterationId={iterationId}
      boardAssignees={boardAssignees}
      onClose={onClose}
    />
  );
}
