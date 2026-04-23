import { useQuery } from '@tanstack/react-query';
import { getWorkItemTypeFields } from '@/ado/endpoints';
import { useSettings } from '@/state/settings.store';

/** Field schema for a work-item type, including `allowedValues` for pick-lists.
 *  Used by the modal to discover custom Bug fields (BugHotfix / Environment / RCA)
 *  by display name and pull their reference name + options. */
export function useWorkItemTypeFields(typeName: string | undefined, enabled: boolean) {
  const projectId = useSettings((s) => s.projectId);
  return useQuery({
    queryKey: ['workitem-type-fields', projectId, typeName],
    queryFn: () => getWorkItemTypeFields(projectId!, typeName!),
    enabled: enabled && !!projectId && !!typeName,
    staleTime: 60 * 60_000,
    retry: false,
  });
}
