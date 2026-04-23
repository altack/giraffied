import { ado, adoPaged, adoRaw } from './client';
import type {
  AdoCommentList,
  AdoConnectionData,
  AdoField,
  AdoFieldDefinition,
  AdoFormLayout,
  AdoIteration,
  AdoIterationWorkItems,
  AdoList,
  AdoProject,
  AdoProjectProperty,
  AdoReorderOperation,
  AdoReorderResponse,
  AdoTaskboardColumns,
  AdoTaskboardWorkItems,
  AdoTeam,
  AdoTeamFieldValues,
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

/** GET all field definitions for a work-item type, with pick-list options expanded.
 *  Used to render Bug-only custom fields (BugHotfix / Environment / RCA) — we match
 *  fields by display name (`name`) and read `referenceName` + `allowedValues` back.
 *  Cache aggressively; field schemas change rarely. */
export async function getWorkItemTypeFields(
  projectId: string,
  typeName: string,
): Promise<AdoFieldDefinition[]> {
  const res = await ado<AdoList<AdoFieldDefinition>>({
    path: `/${encodeURIComponent(projectId)}/_apis/wit/workitemtypes/${encodeURIComponent(typeName)}/fields?$expand=allowedValues`,
  });
  return res.value;
}

/** GET the project's properties, used as ONE input when resolving the process id.
 *  Note: `System.CurrentProcessTemplateId` from this endpoint is the project's
 *  classic template type id, which is NOT what `/_apis/work/processes/{id}` wants
 *  for inherited processes. Use `getProjectCapabilities` or `listProcesses` (with
 *  $expand=Projects) to resolve the inherited-process id instead. */
export async function getProjectProperties(
  projectId: string,
): Promise<AdoProjectProperty[]> {
  const res = await ado<AdoList<AdoProjectProperty>>({
    path: `/_apis/projects/${encodeURIComponent(projectId)}/properties`,
    apiVersion: '7.1-preview.1',
  });
  return res.value;
}

/** GET the project with its capabilities. `capabilities.processTemplate.templateTypeId`
 *  is the id of the inherited process the project runs on (or the classic template id
 *  for old projects — which won't resolve against the `/work/processes` API). */
export interface AdoProjectCapabilities {
  id: string;
  name: string;
  capabilities?: {
    processTemplate?: {
      templateName?: string;
      templateTypeId?: string;
    };
    versioncontrol?: { sourceControlType?: string };
  };
}

export function getProjectCapabilities(
  projectId: string,
): Promise<AdoProjectCapabilities> {
  return ado<AdoProjectCapabilities>({
    path: `/_apis/projects/${encodeURIComponent(projectId)}?includeCapabilities=true`,
  });
}

/** LIST inherited processes in the org. `$expand=Projects` adds each process's
 *  project list, so we can resolve "which process does project X use" even when
 *  `getProjectCapabilities.templateTypeId` is stale or points at a parent classic
 *  template instead of the inherited child. Classic processes do not appear here. */
export interface AdoProcessInfo {
  typeId: string;
  referenceName: string;
  name: string;
  parentProcessTypeId?: string;
  description?: string;
  isEnabled?: boolean;
  isDefault?: boolean;
  customizationType?: string;
  projects?: Array<{ id: string; name: string }>;
}

export async function listProcesses(): Promise<AdoProcessInfo[]> {
  const res = await ado<AdoList<AdoProcessInfo>>({
    path: `/_apis/work/processes?$expand=projects`,
    apiVersion: '7.1-preview.2',
  });
  return res.value;
}

/** GET every field in the org with its data type + picklist flags. One call per
 *  session is plenty — fields rarely change. Used to look up the data type of a
 *  form control's backing field when picking a widget. */
export async function getOrgFields(): Promise<AdoField[]> {
  const res = await ado<AdoList<AdoField>>({
    path: `/_apis/wit/fields`,
  });
  return res.value;
}

/** GET the form layout for a work-item type under a given process. Pages →
 *  sections → groups → controls, with `controlType` hints we map to our widget
 *  set. Requires an inherited (or custom-inherited) process — classic XML
 *  processes expose layout through a different API that we don't support in v1. */
export function getWorkItemTypeLayout(
  processId: string,
  witRefName: string,
): Promise<AdoFormLayout> {
  return ado<AdoFormLayout>({
    path: `/_apis/work/processes/${encodeURIComponent(processId)}/workItemTypes/${encodeURIComponent(witRefName)}/layout`,
    apiVersion: '7.1-preview.1',
  });
}

/** GET a single work item with all fields. The taskboard batch fetch only asks for
 *  a fixed field set (see DEFAULT_WORKITEM_FIELDS) which doesn't include custom fields
 *  like Bug/Hotfix or Environment, so the modal fires this on open to fill them in. */
export function getWorkItem(
  projectId: string,
  id: number,
): Promise<AdoWorkItem> {
  return ado<AdoWorkItem>({
    // $expand=relations so the modal can know which AttachedFile URLs are
    // already linked — that lets save skip duplicate /relations/- ops when the
    // user pastes the same image URL twice.
    path: `/${encodeURIComponent(projectId)}/_apis/wit/workitems/${id}?$expand=relations`,
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
 *  op also reliably clears identity fields like System.AssignedTo.
 *
 *  Optional `addAttachments` appends `/relations/-` ops to bind newly uploaded
 *  attachments (image/video pasted into a description or layout HTML field) to
 *  the work item — without this, the attachment exists in ADO storage but
 *  isn't associated with anything and gets garbage-collected. */
export function patchWorkItemFields(
  projectId: string,
  id: number,
  patches: AdoFieldPatch[],
  addAttachments?: { url: string; name?: string }[],
): Promise<AdoWorkItem> {
  const fieldOps = patches.map((p) =>
    p.value === null || p.value === ''
      ? { op: 'remove', path: `/fields/${p.field}` }
      : { op: 'add', path: `/fields/${p.field}`, value: p.value },
  );
  const relOps = (addAttachments ?? []).map((a) => ({
    op: 'add',
    path: '/relations/-',
    value: {
      rel: 'AttachedFile',
      url: a.url,
      attributes: a.name ? { name: a.name } : undefined,
    },
  }));
  return ado<AdoWorkItem>({
    path: `/${encodeURIComponent(projectId)}/_apis/wit/workitems/${id}`,
    method: 'PATCH',
    contentType: 'application/json-patch+json',
    body: [...fieldOps, ...relOps],
  });
}

/** Upload a binary attachment for later linking to a work item. The returned
 *  `url` is what you embed in the HTML (img src / a href) AND what you attach
 *  to the work item via a `/relations/-` op (rel: AttachedFile).
 *
 *  Two-step flow because ADO needs the upload to exist as a standalone blob
 *  before the work-item PATCH can reference it. The blob is GC'd if no work
 *  item links it within a window (~1 day for free orgs). */
export async function uploadAttachment(
  projectId: string,
  fileName: string,
  blob: Blob,
): Promise<{ id: string; url: string }> {
  const res = await adoRaw({
    path: `/${encodeURIComponent(projectId)}/_apis/wit/attachments?fileName=${encodeURIComponent(fileName)}`,
    method: 'POST',
    body: blob,
    rawBody: true,
    contentType: 'application/octet-stream',
  });
  return (await res.json()) as { id: string; url: string };
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

/** GET the team's area-path field settings. We use `defaultValue` for the
 *  area path of new work items that aren't hanging off a parent (the parent's
 *  own `System.AreaPath` is the preferred source when available). */
export function getTeamFieldValues(
  projectId: string,
  teamId: string,
): Promise<AdoTeamFieldValues> {
  return ado<AdoTeamFieldValues>({
    path: `/${encodeURIComponent(projectId)}/${encodeURIComponent(teamId)}/_apis/work/teamsettings/teamfieldvalues`,
  });
}

/** Create a work item of the given type. Fields are passed as JSON-Patch `add` ops
 *  on `/fields/{name}`. When `parentUrl` is provided (the parent work item's
 *  `url` field from any prior ADO response), a `Hierarchy-Reverse` relation is
 *  appended so the new item becomes a child of that work item.
 *
 *  We deliberately do NOT set `System.State` — ADO applies the team's default
 *  new-item state, which is whichever one maps to the leftmost taskboard column
 *  for most projects. Setting it explicitly would require knowing the mapping
 *  per team, and teams with custom initial states would end up wrong. */
export function createWorkItem(
  projectId: string,
  typeName: string,
  fields: Record<string, AdoFieldValue>,
  parentUrl?: string,
  addAttachments?: { url: string; name?: string }[],
): Promise<AdoWorkItem> {
  const ops: Array<{ op: 'add'; path: string; value: unknown }> = [];
  for (const [name, value] of Object.entries(fields)) {
    if (value === null || value === '') continue;
    ops.push({ op: 'add', path: `/fields/${name}`, value });
  }
  if (parentUrl) {
    ops.push({
      op: 'add',
      path: '/relations/-',
      value: { rel: 'System.LinkTypes.Hierarchy-Reverse', url: parentUrl },
    });
  }
  for (const a of addAttachments ?? []) {
    ops.push({
      op: 'add',
      path: '/relations/-',
      value: {
        rel: 'AttachedFile',
        url: a.url,
        attributes: a.name ? { name: a.name } : undefined,
      },
    });
  }
  return ado<AdoWorkItem>({
    path: `/${encodeURIComponent(projectId)}/_apis/wit/workitems/$${encodeURIComponent(typeName)}`,
    method: 'POST',
    contentType: 'application/json-patch+json',
    body: ops,
  });
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
