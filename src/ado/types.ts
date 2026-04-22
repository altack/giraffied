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

export interface AdoWorkItem {
  id: number;
  rev: number;
  fields: AdoWorkItemFields;
  url: string;
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
  'System.Rev',
  'System.Description',
  'System.AssignedTo',
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
