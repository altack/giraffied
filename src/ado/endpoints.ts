import { ado } from './client';
import type { AdoList, AdoProject, AdoTeam } from './types';

export function listProjects(override?: { org: string; pat: string }) {
  return ado<AdoList<AdoProject>>({
    path: '/_apis/projects?$top=500',
    override,
  });
}

export function listTeams(projectId: string, override?: { org: string; pat: string }) {
  return ado<AdoList<AdoTeam>>({
    path: `/_apis/projects/${encodeURIComponent(projectId)}/teams?$top=500`,
    override,
  });
}
