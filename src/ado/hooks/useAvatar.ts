import { useQuery } from '@tanstack/react-query';
import { useSettings } from '@/state/settings.store';

async function fetchAvatar(url: string, pat: string): Promise<string | null> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${btoa(':' + pat)}`,
      Accept: 'image/*',
    },
  });
  if (!res.ok) return null;
  const blob = await res.blob();
  if (!blob.type.startsWith('image/')) return null;
  return URL.createObjectURL(blob);
}

/** Fetches an ADO avatar via PAT-authenticated GET and returns an object URL.
 *  Cached 24h in the React Query store. Returns null if the URL isn't on
 *  dev.azure.com (extension host_permissions scope) or the fetch fails. */
export function useAvatar(imageUrl: string | undefined) {
  const pat = useSettings((s) => s.pat);
  const isAdoHosted = imageUrl ? /^https:\/\/dev\.azure\.com\//.test(imageUrl) : false;

  return useQuery({
    queryKey: ['avatar', imageUrl],
    queryFn: () => fetchAvatar(imageUrl!, pat!),
    enabled: isAdoHosted && !!pat,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: false,
  });
}
