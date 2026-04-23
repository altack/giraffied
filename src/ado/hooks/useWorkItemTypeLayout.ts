import { useQuery } from '@tanstack/react-query';
import {
  getWorkItemType,
  getWorkItemTypeLayout,
} from '@/ado/endpoints';
import { useSettings } from '@/state/settings.store';
import { useProcessId } from './useProcessId';

/** Fetches the work-item-type's form layout (pages → sections → groups → controls).
 *  The layout endpoint takes a *reference* name like "Custom.Bug" but we only have
 *  the display name ("Bug"), so we chain through `/wit/workitemtypes/{displayName}`
 *  first to get the ref name. Both results are cached for an hour. */
export function useWorkItemTypeLayout(
  wiTypeDisplayName: string | undefined,
  enabled: boolean,
) {
  const projectId = useSettings((s) => s.projectId);
  const processId = useProcessId();

  // Resolve display name → reference name for the layout endpoint.
  const typeRef = useQuery({
    queryKey: ['wit-type-ref', projectId, wiTypeDisplayName],
    queryFn: async () => {
      const t = await getWorkItemType(projectId!, wiTypeDisplayName!);
      return t.referenceName;
    },
    enabled: enabled && !!projectId && !!wiTypeDisplayName,
    staleTime: 60 * 60_000,
    retry: false,
  });

  const layout = useQuery({
    queryKey: ['wit-layout', processId.data, typeRef.data],
    queryFn: () => getWorkItemTypeLayout(processId.data!, typeRef.data!),
    enabled: enabled && !!processId.data && !!typeRef.data,
    staleTime: 60 * 60_000,
    retry: false,
  });

  return {
    data: layout.data,
    isLoading:
      processId.isLoading ||
      (enabled && !!processId.data && typeRef.isLoading) ||
      (enabled && !!typeRef.data && layout.isLoading),
    error: processId.error ?? typeRef.error ?? layout.error ?? null,
  };
}
