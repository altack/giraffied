import { useQuery } from '@tanstack/react-query';
import { listWorkItemComments } from '@/ado/endpoints';
import { useSettings } from '@/state/settings.store';

/** Work-item comments, oldest → newest. Auto-invalidated by comment mutations. */
export function useComments(workItemId: number, enabled: boolean) {
  const projectId = useSettings((s) => s.projectId);
  return useQuery({
    queryKey: ['workitem-comments', projectId, workItemId],
    queryFn: () => listWorkItemComments(projectId!, workItemId),
    enabled: enabled && !!projectId,
    staleTime: 15_000,
    retry: false,
  });
}
