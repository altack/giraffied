import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAdoAttachments } from './useAdoAttachments';
import { isAdoAttachmentUrl } from './attachments';
import { convertMarkdownImages } from './markdownImg';

// ADO stores video attachments as plain anchors; we promote them to
// <video controls> at render time.
const VIDEO_RE = /\.(mp4|webm|mov|ogv|m4v)(\?|#|$)/i;

type Media =
  | { kind: 'image'; src: string; alt?: string }
  | { kind: 'video'; src: string };

function preprocessHtml(html: string, resolved: Map<string, string>): string {
  if (!html) return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');

  doc.body.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => {
    const href = a.getAttribute('href') ?? '';
    if (!VIDEO_RE.test(href)) return;
    // Only inline ADO-hosted videos — those go through our PAT-fetched
    // blob cache. Cross-origin hosts (Jira/SharePoint/etc., common after
    // a migration) need their own auth we don't have; leave them as
    // links so the click handler opens them in a new tab with the user's
    // first-party session.
    if (!isAdoAttachmentUrl(href)) return;
    const video = doc.createElement('video');
    video.src = href;
    video.controls = true;
    video.preload = 'metadata';
    video.className = 'jfd-rt-video';
    a.replaceWith(video);
  });

  doc.body
    .querySelectorAll<HTMLImageElement | HTMLVideoElement>('img, video')
    .forEach((el) => {
      const src = el.getAttribute('src');
      if (!isAdoAttachmentUrl(src)) return;
      const blob = resolved.get(src);
      if (blob) {
        el.setAttribute('src', blob);
        return;
      }
      // Strip src to suppress the broken-image flash; the data attribute
      // drives the placeholder style in globals.css.
      el.removeAttribute('src');
      el.setAttribute('data-jfd-attachment-pending', '1');
    });

  return doc.body.innerHTML;
}

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
  const normalizedHtml = useMemo(() => convertMarkdownImages(html), [html]);
  const { resolved } = useAdoAttachments(normalizedHtml);
  const renderedHtml = useMemo(
    () => preprocessHtml(normalizedHtml, resolved),
    [normalizedHtml, resolved],
  );

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
