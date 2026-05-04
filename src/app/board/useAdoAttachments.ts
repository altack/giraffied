import { useEffect, useMemo, useState } from 'react';
import { fetchAndCacheBlob, getCachedBlobUrl } from './adoImageAuth';
import { isAdoAttachmentUrl } from './attachments';

// Anchors with these extensions are promoted to <video> at render time;
// we prefetch their attachments too so the placeholder doesn't stick.
const VIDEO_EXT_RE = /\.(mp4|webm|mov|ogv|m4v)(\?|#|$)/i;

// DOMParser decodes `&amp;` in src; a regex over raw HTML wouldn't, and
// downstream cache lookups (renderer + Tiptap nodeView, both also DOM-based)
// would miss.
function extractAttachmentSrcs(html: string): string[] {
  if (!html) return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (url: string | null) => {
    if (!isAdoAttachmentUrl(url)) return;
    if (seen.has(url)) return;
    seen.add(url);
    out.push(url);
  };
  doc.body.querySelectorAll<HTMLImageElement | HTMLVideoElement>('img, video').forEach((el) => {
    push(el.getAttribute('src'));
  });
  doc.body.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => {
    const href = a.getAttribute('href');
    if (!href || !VIDEO_EXT_RE.test(href)) return;
    push(href);
  });
  return out;
}

export interface AttachmentResolution {
  /** Stable reference across renders that don't change the resolved set,
   *  so callers can use it as a useMemo dependency without thrashing. */
  resolved: Map<string, string>;
}

export function useAdoAttachments(html: string): AttachmentResolution {
  const urls = useMemo(() => extractAttachmentSrcs(html), [html]);

  const [resolved, setResolved] = useState<Map<string, string>>(() => {
    const m = new Map<string, string>();
    for (const url of urls) {
      const cached = getCachedBlobUrl(url);
      if (cached) m.set(url, cached);
    }
    return m;
  });

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    // Same-reference return when nothing changed — keeps the renderer's
    // `preprocessHtml` memo from rebuilding on no-op effect re-runs.
    setResolved((prev) => {
      const next = new Map<string, string>();
      for (const url of urls) {
        const cached = getCachedBlobUrl(url);
        if (cached) next.set(url, cached);
      }
      if (next.size !== prev.size) return next;
      for (const [k, v] of next) {
        if (prev.get(k) !== v) return next;
      }
      return prev;
    });

    for (const url of urls) {
      if (getCachedBlobUrl(url)) continue;
      void fetchAndCacheBlob(url, controller.signal).then((blobUrl) => {
        if (cancelled || !blobUrl) return;
        setResolved((prev) => {
          if (prev.get(url) === blobUrl) return prev;
          const next = new Map(prev);
          next.set(url, blobUrl);
          return next;
        });
      });
    }

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [urls]);

  return { resolved };
}
