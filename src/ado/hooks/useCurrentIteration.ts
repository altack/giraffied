import { useQuery } from '@tanstack/react-query';
import { getCurrentIteration } from '@/ado/endpoints';
import { useSettings } from '@/state/settings.store';

export function useCurrentIteration() {
  const projectId = useSettings((s) => s.projectId);
  const teamId = useSettings((s) => s.teamId);
  return useQuery({
    queryKey: ['currentIteration', projectId, teamId],
    queryFn: () => getCurrentIteration(projectId!, teamId!),
    enabled: !!projectId && !!teamId,
  });
}
