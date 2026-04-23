import { useQuery } from '@tanstack/react-query';
import { getWorkItemType } from '@/ado/endpoints';
import { useSettings } from '@/state/settings.store';

/** All non-Removed states defined for a work-item type, in ADO's natural order.
 *  The taskboard column config only surfaces states the team *mapped* to columns,
 *  which omits valid states like "New" or "Approved" on many boards. Use this
 *  hook when you need the complete pick list (e.g. the modal's Status dropdown). */
export function useWorkItemStates(
  wiTypeDisplayName: string | undefined,
  enabled: boolean,
) {
  const projectId = useSettings((s) => s.projectId);
  return useQuery({
    queryKey: ['wit-states', projectId, wiTypeDisplayName],
    queryFn: async () => {
      const t = await getWorkItemType(projectId!, wiTypeDisplayName!);
      return t.states
        .filter((s) => s.category !== 'Removed')
        .map((s) => s.name);
    },
    enabled: enabled && !!projectId && !!wiTypeDisplayName,
    staleTime: 60 * 60_000,
    retry: false,
  });
}
