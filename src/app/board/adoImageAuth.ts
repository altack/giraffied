import { fetchAuthedBlob } from '@/ado/client';
import { isAdoAttachmentUrl } from './attachments';

/** Module-level cache of `ADO attachment URL → blob: URL` for image and
 *  video assets we've already PAT-fetched. Persists across re-renders for
 *  the lifetime of the page (board polls every 30s and re-mounts comment
 *  bodies; without this, every poll would flash a broken-image icon
 *  while the cookie path 500s and the recovery fetch races). Blob URLs
 *  remain valid as long as the document is alive. */
const blobCache = new Map<string, string>();

/** Inflight PAT fetches keyed by ADO attachment URL. Lets concurrent
 *  callers (e.g. several `<img>` tags pointing at the same attachment, or
 *  the renderer + the lightbox both wanting the same blob) share one
 *  network request instead of stampeding the endpoint. */
const inflight = new Map<string, Promise<string | null>>();

/** Once we observe a single cookie-auth failure on an ADO attachment, we
 *  assume the user's dev.azure.com session is stale for the rest of the
 *  page's lifetime and pre-empt the doomed cookie fetch on every
 *  subsequent render — no more broken-image flash on each poll. False
 *  positives are harmless: the worst case is we PAT-fetch attachments
 *  that the cookie path could also have served, which is exactly what
 *  every other API call already does. */
let cookieAuthKnownBroken = false;

export function isCookieAuthKnownBroken(): boolean {
  return cookieAuthKnownBroken;
}

export function markCookieAuthBroken(): void {
  cookieAuthKnownBroken = true;
}

export function getCachedBlobUrl(adoUrl: string): string | null {
  return blobCache.get(adoUrl) ?? null;
}

/** Fetch an ADO attachment via the PAT and stash the resulting blob URL
 *  in the module cache. Subsequent calls for the same URL return the
 *  same blob URL without re-fetching. Returns `null` on failure (caller
 *  decides whether to show a broken image, fall back to the cookie URL,
 *  etc). Aborting via `signal` only cancels *this* caller's await — the
 *  underlying fetch keeps going so other waiters still get served. */
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
        markCookieAuthBroken();
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
