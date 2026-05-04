import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { pickerIdentityToAdo, searchOrgIdentities } from '@/ado/endpoints';
import { AdoError } from '@/ado/client';
import type { AdoIdentity } from '@/ado/types';

/** Debounced typed-query → simple state. Returns the value after the user
 *  has stopped typing for `delayMs`. We delay org-wide identity searches
 *  rather than sending one per keystroke; debounce + TanStack stale-time
 *  keep the picker quiet. */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

/** Org-wide identity search for the assignee picker. Wraps the IdentityPicker
 *  REST endpoint behind the existing query cache so repeat searches inside
 *  the picker session don't re-hit ADO.
 *
 *  Disabled for queries shorter than 2 chars: a single-character search
 *  returns thousands of identities and floods the picker before the user
 *  has finished typing. */
export function useIdentitySearch(query: string, enabled: boolean) {
  const trimmed = query.trim();
  return useQuery<AdoIdentity[]>({
    queryKey: ['identity-search', trimmed],
    queryFn: async ({ signal }) => {
      const results = await searchOrgIdentities(trimmed, signal);
      return results.map(pickerIdentityToAdo);
    },
    enabled: enabled && trimmed.length >= 2,
    staleTime: 5 * 60_000,
    // 401/403 means the PAT lacks the scope the IdentityPicker requires.
    // No retries — the failure is structural, not transient.
    retry: (failureCount, err) => {
      if (err instanceof AdoError && (err.status === 401 || err.status === 403)) {
        return false;
      }
      return failureCount < 1;
    },
  });
}
