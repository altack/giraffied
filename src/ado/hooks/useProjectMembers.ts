import { useQuery } from '@tanstack/react-query';
import { listAllProjectMembers } from '@/ado/endpoints';
import { useSettings } from '@/state/settings.store';

/** All team members in the current project, flattened + deduped. The
 *  pool the assignee picker widens to once the user starts typing —
 *  covers cross-team assignments that `useTeamMembers` (current team
 *  only) wouldn't surface. Lazy on `enabled` so the cost is paid on
 *  first search rather than every modal open. */
export function useProjectMembers(enabled: boolean) {
  const projectId = useSettings((s) => s.projectId);
  return useQuery({
    queryKey: ['project-members', projectId],
    queryFn: () => listAllProjectMembers(projectId!),
    enabled: enabled && !!projectId,
    staleTime: 10 * 60_000,
    retry: false,
  });
}
