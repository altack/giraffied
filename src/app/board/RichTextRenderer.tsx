import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import {
  fetchAndCacheBlob,
  getCachedBlobUrl,
  isCookieAuthKnownBroken,
  markCookieAuthBroken,
} from './adoImageAuth';
import { isAdoAttachmentUrl } from './attachments';
import { convertMarkdownImages } from './markdownImg';

// Anchors pointing at these extensions are upgraded to inline <video controls>
// after the HTML mounts. ADO doesn't emit <video> from Trix; it stores video
// attachments as plain links. Keeping this list narrow so we don't accidentally
// rewrite anchors that *look* like videos but link elsewhere.
const VIDEO_RE = /\.(mp4|webm|mov|ogv|m4v)(\?|#|$)/i;


type Media =
  | { kind: 'image'; src: string; alt?: string }
  | { kind: 'video'; src: string };

/** Renders ADO-stored HTML with click enrichments:
 *  - <a> opens in a new tab (and stops propagation so the modal/parent doesn't
 *    interpret the click as "enter edit mode")
 *  - <img> opens a portal'd lightbox with prev/next navigation
 *  - <a href="…mp4|.webm|.mov|.ogv|.m4v"> is rewritten to <video controls>
 *  Outer non-actionable clicks (plain text) bubble normally — that's how the
 *  description's view-mode wrapper transitions into edit mode.
 */
export function RichTextRenderer({
  html,
  className,
}: {
  html: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [lightbox, setLightbox] = useState<{ items: Media[]; index: number } | null>(null);
  // Bare-minimum handling for content stored in markdown form: rewrite
  // `![alt](url)` to `<img>` so images at least render. No full markdown.
  const renderedHtml = useMemo(() => convertMarkdownImages(html), [html]);

  // Synchronous pre-mount sweep: runs after React commits the DOM but
  // before the browser paints. Two jobs:
  //   1. Anchor → <video> rewrite for video-extension hrefs (ADO stores
  //      video attachments as plain links — Trix doesn't emit <video>).
  //   2. Pre-empt the doomed cookie-auth fetch on attachment <img>/<video>
  //      whenever we already know it'll fail. "Already know" means
  //      either: the URL is in our blob cache from an earlier render, OR
  //      we've previously seen *any* cookie-auth failure on this page.
  //      In both cases we strip the src (canceling the in-flight cookie
  //      fetch before the browser paints a broken-image icon) and either
  //      assign the cached blob URL synchronously or kick off a PAT
  //      fetch and assign once it resolves.
  //
  // Doing this in useLayoutEffect (not useEffect) is what makes the flash
  // go away on poll-driven re-renders: by the time the browser would
  // paint, our swap has already landed.
  useLayoutEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    // (1) Promote video-extension anchors into <video controls>.
    root.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => {
      const href = a.getAttribute('href') ?? '';
      if (!VIDEO_RE.test(href)) return;
      if (a.dataset.jfdVideoConverted === '1') return;
      const video = document.createElement('video');
      video.src = href;
      video.controls = true;
      video.preload = 'metadata';
      video.dataset.jfdVideoConverted = '1';
      video.className = 'jfd-rt-video';
      a.replaceWith(video);
    });

    // (2) Pre-emptive swap for any attachment whose blob is cached or
    // whose cookie path is known to be broken on this page.
    const controller = new AbortController();
    const targets = root.querySelectorAll<HTMLImageElement | HTMLVideoElement>(
      'img, video',
    );
    targets.forEach((el) => {
      const src = el.getAttribute('src');
      if (!isAdoAttachmentUrl(src)) return;
      const cached = getCachedBlobUrl(src);
      if (cached) {
        el.setAttribute('src', cached);
        return;
      }
      if (isCookieAuthKnownBroken()) {
        // Strip src to cancel the in-flight cookie fetch (which would
        // 302 → vssps sign-in → 500), then resolve via PAT.
        el.removeAttribute('src');
        void fetchAndCacheBlob(src, controller.signal).then((blobUrl) => {
          if (controller.signal.aborted) return;
          // PAT also failed → put the original back so the cookie path
          // gets a last-resort try (might work if the user re-auth'd
          // since we last saw a 500).
          el.setAttribute('src', blobUrl ?? src);
        });
      }
      // Else: leave the src alone; first-time-on-this-page case. The
      // error listener below catches the cookie failure when (and if)
      // it lands.
    });

    return () => controller.abort();
  }, [renderedHtml]);

  // Error listener: first-time recovery for an attachment whose cookie
  // path failed before we'd seen any failure on this page. Fires once
  // per `<img>`/`<video>` instance; on success it both swaps the src
  // and (via fetchAndCacheBlob) populates the cache so the next render
  // skips the flash entirely. Capture phase because 'error' doesn't
  // bubble for media elements.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const controller = new AbortController();

    const onError = (event: Event) => {
      const el = event.target as HTMLImageElement | HTMLVideoElement | null;
      if (!el) return;
      if (el.tagName !== 'IMG' && el.tagName !== 'VIDEO') return;
      const src = el.getAttribute('src');
      if (!isAdoAttachmentUrl(src)) return;
      if (el.dataset.jfdBlobAttempted === '1') return;
      el.dataset.jfdBlobAttempted = '1';
      markCookieAuthBroken();
      void fetchAndCacheBlob(src, controller.signal).then((blobUrl) => {
        if (controller.signal.aborted) return;
        if (blobUrl) el.setAttribute('src', blobUrl);
      });
    };

    root.addEventListener('error', onError, true);
    return () => {
      root.removeEventListener('error', onError, true);
      controller.abort();
    };
  }, [renderedHtml]);

  const onClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    const link = target.closest('a[href]') as HTMLAnchorElement | null;
    if (link) {
      e.preventDefault();
      e.stopPropagation();
      const href = link.getAttribute('href');
      if (href) window.open(href, '_blank', 'noopener,noreferrer');
      return;
    }

    const img = target.closest('img') as HTMLImageElement | null;
    if (img) {
      e.preventDefault();
      e.stopPropagation();
      const items = collectMedia(containerRef.current);
      const src = img.currentSrc || img.src;
      const idx = Math.max(
        0,
        items.findIndex((m) => m.kind === 'image' && m.src === src),
      );
      setLightbox({ items, index: idx });
      return;
    }

    const video = target.closest('video') as HTMLVideoElement | null;
    if (video) {
      // Don't intercept the video's own controls; just keep the click from
      // bubbling out into a parent that would treat it as "enter edit mode".
      e.stopPropagation();
    }
  }, []);

  return (
    <>
      <div
        ref={containerRef}
        className={cn('jfd-rt', className)}
        onClick={onClick}
        // ADO-stored HTML, trusted (auth'd org content; same provenance the
        // native ADO UI renders).
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />
      {lightbox && (
        <Lightbox
          items={lightbox.items}
          index={lightbox.index}
          onClose={() => setLightbox(null)}
          onIndex={(i) =>
            setLightbox((s) => (s ? { ...s, index: i } : s))
          }
        />
      )}
    </>
  );
}

function collectMedia(root: HTMLElement | null): Media[] {
  if (!root) return [];
  const items: Media[] = [];
  root.querySelectorAll<HTMLElement>('img, video').forEach((el) => {
    if (el.tagName === 'IMG') {
      const img = el as HTMLImageElement;
      const src = img.currentSrc || img.src;
      if (src) items.push({ kind: 'image', src, alt: img.alt });
    } else {
      const video = el as HTMLVideoElement;
      const src = video.currentSrc || video.src;
      if (src) items.push({ kind: 'video', src });
    }
  });
  return items;
}

function Lightbox({
  items,
  index,
  onClose,
  onIndex,
}: {
  items: Media[];
  index: number;
  onClose: () => void;
  onIndex: (i: number) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'ArrowRight' && items.length > 1) {
        onIndex((index + 1) % items.length);
      } else if (e.key === 'ArrowLeft' && items.length > 1) {
        onIndex((index - 1 + items.length) % items.length);
      }
    };
    // Capture so we beat the modal's own Esc handler.
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [index, items.length, onClose, onIndex]);

  const item = items[index];
  if (!item) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/85 backdrop-blur-sm"
      onClick={(e) => {
        // Lightbox renders into a portal, but React still bubbles synthetic
        // events through the *React tree*, not the DOM tree. Without this,
        // every click inside the lightbox would propagate back into the
        // RichTextRenderer (and any ancestor onClick — e.g. DescriptionField's
        // click-to-edit) which is the opposite of what the user expects.
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 grid place-items-center w-9 h-9 rounded-full bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.12] text-zinc-200"
      >
        <X size={18} />
      </button>
      {items.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous"
            onClick={() => onIndex((index - 1 + items.length) % items.length)}
            className="absolute left-4 grid place-items-center w-10 h-10 rounded-full bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.12] text-zinc-200"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            type="button"
            aria-label="Next"
            onClick={() => onIndex((index + 1) % items.length)}
            className="absolute right-4 grid place-items-center w-10 h-10 rounded-full bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.12] text-zinc-200"
          >
            <ChevronRight size={20} />
          </button>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 mono text-[11px] text-zinc-300 px-2.5 py-1 rounded-full bg-white/[0.06] border border-white/[0.10]">
            {index + 1} / {items.length}
          </div>
        </>
      )}
      {item.kind === 'image' ? (
        <img
          src={item.src}
          alt={item.alt ?? ''}
          className="max-w-[92vw] max-h-[88vh] object-contain rounded-md shadow-2xl"
        />
      ) : (
        <video
          src={item.src}
          controls
          autoPlay
          className="max-w-[92vw] max-h-[88vh] rounded-md shadow-2xl bg-black"
        />
      )}
    </div>,
    document.body,
  );
}
