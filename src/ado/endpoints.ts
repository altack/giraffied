import { adoPaged } from './client';
import type { AdoProject, AdoTeam } from './types';

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
