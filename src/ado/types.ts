export interface AdoList<T> {
  count: number;
  value: T[];
}

export interface AdoProject {
  id: string;
  name: string;
  description?: string;
  url: string;
  state?: string;
}

export interface AdoTeam {
  id: string;
  name: string;
  description?: string;
  projectName?: string;
  projectId?: string;
  url?: string;
}

export interface AdoIdentity {
  displayName: string;
  uniqueName?: string;
  id?: string;
  imageUrl?: string;
  descriptor?: string;
}

export interface AdoTeamMember {
  identity: AdoIdentity;
  isTeamAdmin?: boolean;
}

export interface AdoIteration {
  id: string;
  name: string;
  path: string;
  attributes: {
    startDate: string | null;
    finishDate: string | null;
    timeFrame: 'current' | 'past' | 'future';
  };
}

export interface AdoIterationWorkItemRelation {
  rel: string | null;
  source: { id: number } | null;
  target: { id: number };
}

export interface AdoIterationWorkItems {
  workItemRelations: AdoIterationWorkItemRelation[];
  url: string;
}

export interface AdoTaskboardColumn {
  id: string;
  name: string;
  /** e.g. { Task: "In Progress", Bug: "Active" } — state value per work-item type */
  mappings: Record<string, string>;
}

export interface AdoTaskboardColumns {
  columns: AdoTaskboardColumn[];
  isCustomized?: boolean;
  isValid?: boolean;
}

/** Shape ADO actually returns from `/work/taskboardworkitems/{iterationId}`:
 *  `workItemId` (not `id`), `state`, `column`, `columnId`. No `workItemType`
 *  and no `order` — cross-reference with the batched work-item details when
 *  those are needed. */
export interface AdoTaskboardWorkItem {
  workItemId: number;
  state: string;
  column: string;
  columnId: string;
}

export interface AdoTaskboardWorkItems {
  value: AdoTaskboardWorkItem[];
}

export interface AdoReorderOperation {
  ids: number[];
  /** ID of the item that should end up before the reordered items. 0 = start of list. */
  previousId: number;
  /** ID of the item that should end up after the reordered items. 0 = end of list. */
  nextId: number;
  /** Shared parent of the reordered items. 0 = no parent. */
  parentId: number;
  /** Only used when reordering from the iteration backlog, not the taskboard. */
  iterationPath?: string;
}

export interface AdoReorderResult {
  id: number;
  order: number;
}

export interface AdoReorderResponse {
  count: number;
  value: AdoReorderResult[];
}

export interface AdoWorkItemFields {
  'System.Id': number;
  'System.Title': string;
  'System.State': string;
  'System.WorkItemType': string;
  'System.Rev'?: number;
  'System.Description'?: string;
  'System.AssignedTo'?: AdoIdentity;
  'System.CreatedBy'?: AdoIdentity;
  'System.Tags'?: string;
  'System.IterationPath'?: string;
  'System.AreaPath'?: string;
  'Microsoft.VSTS.Scheduling.StoryPoints'?: number;
  'Microsoft.VSTS.Scheduling.Effort'?: number;
  'Microsoft.VSTS.Scheduling.Size'?: number;
  'Microsoft.VSTS.Scheduling.RemainingWork'?: number;
  'Microsoft.VSTS.Scheduling.CompletedWork'?: number;
  'Microsoft.VSTS.Common.StackRank'?: number;
  [key: string]: unknown;
}

/** A single relation entry on a work item. The two we care about today are
 *  `AttachedFile` (binary attachments via the upload endpoint) and the
 *  `System.LinkTypes.Hierarchy-{Forward,Reverse}` relations (parent/child). */
export interface AdoWorkItemRelation {
  rel: string;
  url: string;
  attributes?: Record<string, unknown>;
}

export interface AdoWorkItem {
  id: number;
  rev: number;
  fields: AdoWorkItemFields;
  url: string;
  /** Populated only when the request asked for `?$expand=relations` (or `all`). */
  relations?: AdoWorkItemRelation[];
}

export type AdoStateCategory =
  | 'Proposed'
  | 'InProgress'
  | 'Resolved'
  | 'Completed'
  | 'Removed';

export interface AdoWorkItemTypeState {
  name: string;
  color: string;
  category: AdoStateCategory;
}

export interface AdoWorkItemType {
  name: string;
  referenceName: string;
  description?: string;
  states: AdoWorkItemTypeState[];
}

export const DEFAULT_WORKITEM_FIELDS = [
  'System.Id',
  'System.Title',
  'System.State',
  'System.WorkItemType',
  'System.TeamProject',
  'System.Rev',
  'System.Description',
  'System.AssignedTo',
  'System.CreatedBy',
  'System.Tags',
  'System.IterationPath',
  'System.AreaPath',
  'Microsoft.VSTS.Scheduling.StoryPoints',
  'Microsoft.VSTS.Scheduling.Effort',
  'Microsoft.VSTS.Scheduling.Size',
  'Microsoft.VSTS.Scheduling.RemainingWork',
  'Microsoft.VSTS.Scheduling.CompletedWork',
  'Microsoft.VSTS.Common.StackRank',
] as const;

/** One entry from `GET /_apis/wit/fields?api-version=7.1` — the org-wide field registry.
 *  We use the field's `type` to decide which widget can edit it (html → rich text,
 *  integer → number input, …) and `isPicklist` + `isIdentity` to refine the choice. */
export type AdoFieldDataType =
  | 'string'
  | 'integer'
  | 'double'
  | 'boolean'
  | 'dateTime'
  | 'html'
  | 'history'
  | 'plainText'
  | 'treePath'
  | 'guid'
  | 'identity'
  | 'picklistString'
  | 'picklistInteger'
  | 'picklistDouble';

export interface AdoField {
  referenceName: string;
  name: string;
  description?: string;
  type: AdoFieldDataType;
  usage?: string;
  readOnly?: boolean;
  canSortBy?: boolean;
  isQueryable?: boolean;
  isIdentity?: boolean;
  isPicklist?: boolean;
  isPicklistSuggested?: boolean;
  picklistId?: string;
  url?: string;
  isDeleted?: boolean;
}

/** One project property entry from `GET /_apis/projects/{id}/properties`. We read the
 *  `System.CurrentProcessTemplateId` key off this to resolve the project's process id. */
export interface AdoProjectProperty {
  name: string;
  value: string;
}

/** Shape of `GET /_apis/work/processes/{processId}/workItemTypes/{ref}/layout`.
 *  Pages (tabs) → sections (columns within a page) → groups (collapsible panels) →
 *  controls (individual field widgets). We only consume the first custom page for
 *  v1; history/discussion/etc pages are non-form and we render them ourselves. */
export interface AdoFormLayout {
  pages: AdoFormPage[];
  systemControls?: AdoFormControl[];
  extensions?: unknown[];
}

export interface AdoFormPage {
  id: string;
  label: string;
  locked?: boolean;
  visible?: boolean;
  order?: number;
  /** "custom" is the main editable tab; "history" / "links" / "attachments" are
   *  non-form. Giraffied only reads controls from `custom` pages. */
  pageType?: string;
  sections: AdoFormSection[];
  inherited?: boolean;
  overridden?: boolean;
}

export interface AdoFormSection {
  id: string;
  groups: AdoFormGroup[];
  overridden?: boolean;
}

export interface AdoFormGroup {
  id: string;
  label?: string;
  visible?: boolean;
  order?: number;
  controls: AdoFormControl[];
  inherited?: boolean;
  overridden?: boolean;
  height?: number;
  isContribution?: boolean;
}

export interface AdoFormControl {
  id: string;
  label?: string;
  /** One of FieldControl | HtmlFieldControl | DateTimeControl | IdentityFieldControl |
   *  WorkItemClassificationControl | … — the widget hint from the process template.
   *  `null` / missing when the control is a contribution-based extension. */
  controlType?: string | null;
  readOnly?: boolean;
  visible?: boolean;
  order?: number;
  watermark?: string;
  metadata?: string;
  height?: number;
  inherited?: boolean;
  overridden?: boolean;
  isContribution?: boolean;
  /** Field reference name this control edits. For FieldControls this is usually the
   *  same as `id`; for contribution controls it lives on `fieldRef` instead. Read
   *  both. */
  fieldRef?: string;
  /** Contribution metadata, present when the control is a marketplace extension
   *  (multi-value picklist, rich picker, …). The actual field reference usually
   *  lives in `contribution.inputs.FieldName`. */
  contribution?: {
    contributionId?: string;
    inputs?: Record<string, unknown>;
    height?: number;
  };
}

/** One entry from `GET /{project}/_apis/wit/workitemtypes/{type}/fields?$expand=allowedValues`.
 *  `name` is the display name shown in ADO; `referenceName` is the API id we PATCH against
 *  (e.g. `Custom.DigitalPlatformsBugHotfix`). `allowedValues` is populated for pick-list
 *  fields when we pass `$expand=allowedValues`. */
export interface AdoFieldDefinition {
  referenceName: string;
  name: string;
  helpText?: string;
  alwaysRequired?: boolean;
  defaultValue?: unknown;
  allowedValues?: string[];
  url?: string;
}

/** A single work-item comment from `GET /wit/workItems/{id}/comments`.
 *  `text` is HTML when the list was fetched with `format=html` (our default). */
export interface AdoWorkItemComment {
  workItemId: number;
  commentId: number;
  version: number;
  text: string;
  createdBy: AdoIdentity;
  createdDate: string;
  modifiedBy?: AdoIdentity;
  modifiedDate?: string;
  isDeleted?: boolean;
  url?: string;
}

export interface AdoCommentList {
  totalCount: number;
  count: number;
  comments: AdoWorkItemComment[];
  continuationToken?: string;
  nextPage?: string;
}

/** Shape of one entry returned from `POST /_apis/IdentityPicker/Identities`.
 *  This is the same endpoint the native ADO web UI uses to power its
 *  assignee/people pickers, so it can resolve any identity in the org —
 *  including users who have never been on the current board or team
 *  (which `listTeamMembers` would not surface). The picker accepts the
 *  same Basic-auth PAT we use everywhere else. The response is wrapped in
 *  `{ results: [{ queryToken, identities: [...] }] }` — one results
 *  entry per query token (we only ever send one). */
export interface AdoPickerIdentity {
  entityId?: string;
  entityType?: 'User' | 'Group' | string;
  originDirectory?: string;
  originId?: string;
  localDirectory?: string;
  localId?: string;
  displayName: string;
  scopeName?: string;
  samAccountName?: string;
  subjectDescriptor?: string;
  /** AAD-backed orgs populate `signInAddress` (the user's UPN). MSA-backed
   *  orgs populate `mail` (the user's primary email). System.AssignedTo
   *  accepts either as the uniqueName, so we coalesce when mapping. */
  signInAddress?: string;
  mail?: string;
  isMru?: boolean;
  active?: boolean;
  /** Some tenants populate this; others don't. When present we forward it
   *  to AdoIdentity.imageUrl so the avatar can fade in instead of showing
   *  initials. */
  image?: string;
}

export interface AdoPickerSearchResponse {
  results: Array<{
    queryToken: string;
    identities: AdoPickerIdentity[];
    pagingToken?: string;
  }>;
}

/** Reply from `GET /_apis/connectionData`. We only care about the authenticated user id. */
export interface AdoConnectionData {
  authenticatedUser: {
    id: string;
    providerDisplayName?: string;
    customDisplayName?: string;
    mailAddress?: string;
    descriptor?: string;
    subjectDescriptor?: string;
  };
  authorizedUser?: AdoConnectionData['authenticatedUser'];
}

/** Reply from `GET /{project}/{team}/_apis/work/teamsettings/teamfieldvalues`.
 *  Used to learn the team's default area path for new work items that have no
 *  parent to copy it from. The `field.referenceName` is usually
 *  `System.AreaPath`; `defaultValue` is the tree-path string ADO expects in
 *  `System.AreaPath`. */
export interface AdoTeamFieldValues {
  field: { referenceName: string; url?: string };
  defaultValue: string;
  values: Array<{ value: string; includeChildren: boolean }>;
  url?: string;
}

/** Flat-query result from `POST /_apis/wit/wiql`. Tree/link queries (with
 *  `workItemRelations`) aren't used by the omnibar — we only issue flat
 *  selects. Only `System.Id` is guaranteed populated; everything else is
 *  batch-fetched separately so we can control exactly which fields come back. */
export interface AdoWiqlRef {
  id: number;
  url: string;
}

export interface AdoWiqlResult {
  queryType: string;
  queryResultType: string;
  asOf?: string;
  columns?: Array<{ referenceName: string; name: string; url: string }>;
  workItems: AdoWiqlRef[];
}

/** Shape of an item returned from `GET /wit/workitems/{id}/updates`. Each entry is a
 *  revision event — the diff of fields between revs and the person who made it. */
export interface AdoWorkItemUpdate {
  id: number;
  workItemId: number;
  rev: number;
  revisedBy: AdoIdentity;
  revisedDate: string;
  /** Per-field before/after (`oldValue`/`newValue`). Values can be primitives or identities. */
  fields?: Record<string, { oldValue?: unknown; newValue?: unknown }>;
  /** Relations added/removed. We don't render these in history v1. */
  relations?: unknown;
  url: string;
}
