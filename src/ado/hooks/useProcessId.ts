import { useQuery } from '@tanstack/react-query';
import {
  getProjectCapabilities,
  listProcesses,
} from '@/ado/endpoints';
import { useSettings } from '@/state/settings.store';

/** Resolve the inherited-process id that backs the `/work/processes/{id}/layout`
 *  endpoint. Three-step strategy, most authoritative first:
 *
 *  1. `listProcesses($expand=projects)` — find the inherited process whose projects
 *     list includes our project id. Gold standard: it's what the layout API reads.
 *  2. Fall back to `getProjectCapabilities.templateTypeId` — usually correct but can
 *     point at a classic parent template for newly-migrated projects.
 *  3. If neither yields a process that exists in `listProcesses`, bail — the project
 *     is probably on a classic Agile/Scrum/CMMI process that has no layout API and
 *     the modal will gracefully fall back to structural-only fields. */
export function useProcessId() {
  const projectId = useSettings((s) => s.projectId);
  return useQuery({
    queryKey: ['process-id', projectId],
    queryFn: async () => {
      const [processes, caps] = await Promise.all([
        listProcesses().catch(() => []),
        getProjectCapabilities(projectId!).catch(() => null),
      ]);

      const fromListing = processes.find((p) =>
        (p.projects ?? []).some((pr) => pr.id === projectId),
      );
      if (fromListing?.typeId) return fromListing.typeId;

      const capId = caps?.capabilities?.processTemplate?.templateTypeId;
      if (capId && processes.some((p) => p.typeId === capId)) return capId;

      throw new Error(
        'Project uses a classic process template without a REST layout API',
      );
    },
    enabled: !!projectId,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });
}
