import { useQuery } from '@tanstack/react-query';
import { getConnectionData } from '@/ado/endpoints';
import { useSettings } from '@/state/settings.store';

/** The authenticated user, fetched once per org via `/_apis/connectionData`.
 *  Used to show edit/delete affordances on own comments. */
export function useCurrentUser() {
  const org = useSettings((s) => s.org);
  return useQuery({
    queryKey: ['connection-data', org],
    queryFn: () => getConnectionData(),
    enabled: !!org,
    staleTime: 24 * 60 * 60_000,
    retry: false,
  });
}
