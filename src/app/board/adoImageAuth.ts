import { fetchAuthedBlob } from '@/ado/client';
import { isAdoAttachmentUrl } from './attachments';

// Page-lifetime cache. Blob URLs stay valid until the document unloads.
const blobCache = new Map<string, string>();
// Dedupe concurrent fetches for the same URL.
const inflight = new Map<string, Promise<string | null>>();

export function getCachedBlobUrl(adoUrl: string): string | null {
  return blobCache.get(adoUrl) ?? null;
}

export async function fetchAndCacheBlob(
  url: string,
  signal?: AbortSignal,
): Promise<string | null> {
  if (!isAdoAttachmentUrl(url)) return null;
  const cached = blobCache.get(url);
  if (cached) return cached;
  let pending = inflight.get(url);
  if (!pending) {
    pending = (async () => {
      try {
        const blob = await fetchAuthedBlob(url);
        const blobUrl = URL.createObjectURL(blob);
        blobCache.set(url, blobUrl);
        return blobUrl;
      } catch {
        return null;
      } finally {
        inflight.delete(url);
      }
    })();
    inflight.set(url, pending);
  }
  if (signal?.aborted) return null;
  return await pending;
}
