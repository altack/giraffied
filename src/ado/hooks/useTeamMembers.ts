import { useQuery } from '@tanstack/react-query';
import { listTeamMembers } from '@/ado/endpoints';
import { useSettings } from '@/state/settings.store';

/** Team members, loaded on first modal open and cached for the session. */
export function useTeamMembers() {
  const projectId = useSettings((s) => s.projectId);
  const teamId = useSettings((s) => s.teamId);
  return useQuery({
    queryKey: ['team-members', projectId, teamId],
    queryFn: () => listTeamMembers(projectId!, teamId!),
    enabled: !!projectId && !!teamId,
    staleTime: 10 * 60_000,
    retry: false,
  });
}
