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
}

export interface AdoTaskboardWorkItem {
  id: number;
  workItemType: string;
  state: string;
  column: string;
  columnId: string;
  order: number;
}

export interface AdoTaskboardWorkItems {
  value: AdoTaskboardWorkItem[];
}

export interface AdoWorkItemFields {
  'System.Id': number;
  'System.Title': string;
  'System.State': string;
  'System.WorkItemType': string;
  'System.AssignedTo'?: AdoIdentity;
  'System.Tags'?: string;
  'System.IterationPath'?: string;
  'System.AreaPath'?: string;
  'Microsoft.VSTS.Scheduling.StoryPoints'?: number;
  'Microsoft.VSTS.Scheduling.RemainingWork'?: number;
  'Microsoft.VSTS.Common.StackRank'?: number;
  [key: string]: unknown;
}

export interface AdoWorkItem {
  id: number;
  rev: number;
  fields: AdoWorkItemFields;
  url: string;
}

export const DEFAULT_WORKITEM_FIELDS = [
  'System.Id',
  'System.Title',
  'System.State',
  'System.WorkItemType',
  'System.AssignedTo',
  'System.Tags',
  'System.IterationPath',
  'System.AreaPath',
  'Microsoft.VSTS.Scheduling.StoryPoints',
  'Microsoft.VSTS.Scheduling.RemainingWork',
  'Microsoft.VSTS.Common.StackRank',
] as const;
