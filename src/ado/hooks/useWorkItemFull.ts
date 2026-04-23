import { useQuery } from '@tanstack/react-query';
import { getWorkItem } from '@/ado/endpoints';
import { useSettings } from '@/state/settings.store';

/** Single work item with ALL fields (no field filter). The taskboard query only batches
 *  DEFAULT_WORKITEM_FIELDS, which omits custom fields. The modal uses this on open to
 *  surface Bug/Hotfix, Environment, RCA values that aren't in the board cache. */
export function useWorkItemFull(workItemId: number, enabled: boolean) {
  const projectId = useSettings((s) => s.projectId);
  return useQuery({
    queryKey: ['workitem-full', projectId, workItemId],
    queryFn: () => getWorkItem(projectId!, workItemId),
    enabled: enabled && !!projectId,
    staleTime: 30_000,
    retry: false,
  });
}
