import { ado, adoPaged } from './client';
import type {
  AdoIteration,
  AdoIterationWorkItems,
  AdoList,
  AdoProject,
  AdoTaskboardColumns,
  AdoTaskboardWorkItems,
  AdoTeam,
  AdoWorkItem,
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
