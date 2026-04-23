import { useQuery } from '@tanstack/react-query';
import { getOrgFields } from '@/ado/endpoints';
import { useSettings } from '@/state/settings.store';
import type { AdoField } from '@/ado/types';

/** Every field registered in the org, keyed by referenceName in a Map. Used to pick
 *  a widget for each form control (html/plainText/integer/identity/…). One fetch per
 *  session — the registry changes rarely. */
export function useOrgFields() {
  const org = useSettings((s) => s.org);
  return useQuery({
    queryKey: ['org-fields', org],
    queryFn: async () => {
      const fields = await getOrgFields();
      const byRef = new Map<string, AdoField>();
      for (const f of fields) byRef.set(f.referenceName, f);
      return { fields, byRef };
    },
    enabled: !!org,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });
}
