import { ado, adoPaged } from './client';
import type {
  AdoCommentList,
  AdoConnectionData,
  AdoIteration,
  AdoIterationWorkItems,
  AdoList,
  AdoProject,
  AdoReorderOperation,
  AdoReorderResponse,
  AdoTaskboardColumns,
  AdoTaskboardWorkItems,
  AdoTeam,
  AdoTeamMember,
  AdoWorkItem,
  AdoWorkItemComment,
  AdoWorkItemType,
  AdoWorkItemUpdate,
} from './types';
import { DEFAULT_WORKITEM_FIELDS } from './types';

const byName = <T extends { name: string }>(a: T, b: T) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

export async function listProjects(
  override?: { org: string; pat: string },
): Promise<AdoProject[]> {
  const projects = await adoPaged<AdoProject>({
    path: '/_apis/projects?$top=500',
    override,
  });
  return projects.sort(byName);
}

export async function listTeams(
  projectId: string,
  override?: { org: string; pat: string },
): Promise<AdoTeam[]> {
  const teams = await adoPaged<AdoTeam>({
    path: `/_apis/projects/${encodeURIComponent(projectId)}/teams?$top=500`,
    override,
  });
  return teams.sort(byName);
}

/** GET the members of a team. Response entries are wrapped as `{ identity, isTeamAdmin }`. */
export async function listTeamMembers(
  projectId: string,
  teamId: string,
): Promise<AdoTeamMember[]> {
  const members = await adoPaged<AdoTeamMember>({
    path: `/_apis/projects/${encodeURIComponent(projectId)}/teams/${encodeURIComponent(teamId)}/members?$top=500`,
  });
  return members.sort((a, b) =>
    a.identity.displayName.localeCompare(b.identity.displayName, undefined, {
      sensitivity: 'base',
    }),
  );
}

/** GET current iteration for a team. Returns null if the team has no current iteration. */
export async function getCurrentIteration(
  projectId: string,
  teamId: string,
): Promise<AdoIteration | null> {
  const res = await ado<AdoList<AdoIteration>>({
    path: `/${encodeURIComponent(projectId)}/${encodeURIComponent(teamId)}/_apis/work/teamsettings/iterations?$timeframe=current`,
  });
  return res.value[0] ?? null;
}

/** GET iteration's work item relations (parent→child tree). */
export function getIterationWorkItems(
  projectId: string,
  teamId: string,
  iterationId: string,
): Promise<AdoIterationWorkItems> {
  return ado<AdoIterationWorkItems>({
    path: `/${encodeURIComponent(projectId)}/${encodeURIComponent(teamId)}/_apis/work/teamsettings/iterations/${encodeURIComponent(iterationId)}/workitems`,
  });
}

/** GET taskboard column config for a team (column → state mappings per work item type). */
export function getTaskboardColumns(
  projectId: string,
  teamId: string,
): Promise<AdoTaskboardColumns> {
  return ado<AdoTaskboardColumns>({
    path: `/${encodeURIComponent(projectId)}/${encodeURIComponent(teamId)}/_apis/work/taskboardcolumns`,
    apiVersion: '7.1-preview.1',
  });
}

/** GET which column each taskboard card is currently in, with in-column order. */
export function getTaskboardWorkItems(
  projectId: string,
  teamId: string,
  iterationId: string,
): Promise<AdoTaskboardWorkItems> {
  return ado<AdoTaskboardWorkItems>({
    path: `/${encodeURIComponent(projectId)}/${encodeURIComponent(teamId)}/_apis/work/taskboardworkitems/${encodeURIComponent(iterationId)}`,
    apiVersion: '7.1-preview.1',
  });
}

/** GET a single work-item type definition (for its states + state categories). */
export function getWorkItemType(
  projectId: string,
  typeName: string,
): Promise<AdoWorkItemType> {
  return ado<AdoWorkItemType>({
    path: `/${encodeURIComponent(projectId)}/_apis/wit/workitemtypes/${encodeURIComponent(typeName)}`,
  });
}

/** Reorder one or more work items within an iteration (taskboard).
 *  `previousId=0` means "pin to the top", `nextId=0` means "pin to the bottom".
 *  `parentId=0` is used for items that have no parent in this iteration. */
export function reorderIterationWorkItems(
  projectId: string,
  teamId: string,
  iterationId: string,
  op: AdoReorderOperation,
): Promise<AdoReorderResponse> {
  return ado<AdoReorderResponse>({
    path: `/${encodeURIComponent(projectId)}/${encodeURIComponent(teamId)}/_apis/work/iterations/${encodeURIComponent(iterationId)}/workitemsorder`,
    method: 'PATCH',
    body: op,
  });
}

export type AdoFieldValue = string | number | null;

export interface AdoFieldPatch {
  field: string;
  value: AdoFieldValue;
}

/** PATCH a single field on a work item using JSON Patch. Used for column changes
 *  (System.State) when a card is dragged between columns. */
export function patchWorkItemField(
  projectId: string,
  id: number,
  field: string,
  value: AdoFieldValue,
): Promise<AdoWorkItem> {
  return patchWorkItemFields(projectId, id, [{ field, value }]);
}

/** PATCH multiple fields on a work item in a single request.
 *
 *  For "clear this field" (null or empty string), we emit `op: "remove"` with
 *  no `value`. Sending `{ op: "add", value: "" }` for System.Tags is silently
 *  a no-op — ADO only honors removal via the JSON-Patch `remove` op. The same
 *  op also reliably clears identity fields like System.AssignedTo. */
export function patchWorkItemFields(
  projectId: string,
  id: number,
  patches: AdoFieldPatch[],
): Promise<AdoWorkItem> {
  return ado<AdoWorkItem>({
    path: `/${encodeURIComponent(projectId)}/_apis/wit/workitems/${id}`,
    method: 'PATCH',
    contentType: 'application/json-patch+json',
    body: patches.map((p) =>
      p.value === null || p.value === ''
        ? { op: 'remove', path: `/fields/${p.field}` }
        : { op: 'add', path: `/fields/${p.field}`, value: p.value },
    ),
  });
}

/* ── Comments ─────────────────────────────────────────────────────────────── */

const COMMENTS_API = '7.1-preview.4';

/** GET all comments for a work item, oldest → newest. Follows `continuationToken`.
 *
 *  Compatibility note: ADO orgs emit the comment id under either `commentId`
 *  (documented for 7.1-preview.4) or just `id` (what Services actually returns
 *  in some tenants). We normalize to `commentId` so the rest of the app can
 *  rely on it. */
export async function listWorkItemComments(
  projectId: string,
  id: number,
): Promise<AdoWorkItemComment[]> {
  const all: AdoWorkItemComment[] = [];
  let token: string | undefined;
  for (let page = 0; page < 20; page++) {
    const base = `/${encodeURIComponent(projectId)}/_apis/wit/workItems/${id}/comments`;
    const path = token ? `${base}?continuationToken=${encodeURIComponent(token)}` : base;
    const body = await ado<AdoCommentList>({ path, apiVersion: COMMENTS_API });
    for (const c of body.comments) {
      all.push(normalizeComment(c));
    }
    token = body.continuationToken;
    if (!token) break;
  }
  return all.sort(
    (a, b) => new Date(a.createdDate).getTime() - new Date(b.createdDate).getTime(),
  );
}

function normalizeComment(c: AdoWorkItemComment): AdoWorkItemComment {
  if (c.commentId != null) return c;
  const alt = (c as AdoWorkItemComment & { id?: number }).id;
  return alt != null ? { ...c, commentId: alt } : c;
}

export async function createWorkItemComment(
  projectId: string,
  id: number,
  text: string,
): Promise<AdoWorkItemComment> {
  const c = await ado<AdoWorkItemComment>({
    path: `/${encodeURIComponent(projectId)}/_apis/wit/workItems/${id}/comments?format=html`,
    method: 'POST',
    apiVersion: COMMENTS_API,
    body: { text },
  });
  return normalizeComment(c);
}

export async function updateWorkItemComment(
  projectId: string,
  workItemId: number,
  commentId: number,
  text: string,
): Promise<AdoWorkItemComment> {
  // No `?format=html` on PATCH: the documented update endpoint doesn't accept
  // that query param and some orgs respond 400 when it's present. The comment
  // keeps its original format (html, since that's how we create them).
  const c = await ado<AdoWorkItemComment>({
    path: `/${encodeURIComponent(projectId)}/_apis/wit/workItems/${workItemId}/comments/${commentId}`,
    method: 'PATCH',
    apiVersion: COMMENTS_API,
    body: { text },
  });
  return normalizeComment(c);
}

export function deleteWorkItemComment(
  projectId: string,
  workItemId: number,
  commentId: number,
): Promise<void> {
  return ado<void>({
    path: `/${encodeURIComponent(projectId)}/_apis/wit/workItems/${workItemId}/comments/${commentId}`,
    method: 'DELETE',
    apiVersion: COMMENTS_API,
  });
}

/** Resolve the authenticated user id. Used to show edit/delete on own comments. */
export function getConnectionData(): Promise<AdoConnectionData> {
  return ado<AdoConnectionData>({
    path: `/_apis/connectionData`,
    apiVersion: '7.1-preview.1',
  });
}

/** GET the revision history of a work item. Most-recent rev last. */
export async function listWorkItemUpdates(
  projectId: string,
  id: number,
): Promise<AdoWorkItemUpdate[]> {
  const res = await ado<AdoList<AdoWorkItemUpdate>>({
    path: `/${encodeURIComponent(projectId)}/_apis/wit/workitems/${id}/updates`,
  });
  return res.value;
}

/** Batch-fetch full work item details. ADO caps at 200 IDs per call; we chunk. */
export async function getWorkItemsBatch(
  projectId: string,
  ids: number[],
  fields: readonly string[] = DEFAULT_WORKITEM_FIELDS,
): Promise<AdoWorkItem[]> {
  if (ids.length === 0) return [];
  const CHUNK = 200;
  const chunks: number[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));

  const results = await Promise.all(
    chunks.map((chunk) =>
      ado<AdoList<AdoWorkItem>>({
        path: `/${encodeURIComponent(projectId)}/_apis/wit/workitemsbatch`,
        method: 'POST',
        body: { ids: chunk, fields },
      }),
    ),
  );
  return results.flatMap((r) => r.value);
}
