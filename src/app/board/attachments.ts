/** Helpers for tracking ADO attachments embedded in HTML.
 *
 *  When the user pastes/drops an image or video into a description or comment,
 *  we upload it to `/_apis/wit/attachments` and embed the returned URL inline.
 *  Saving the work item then needs to also add `AttachedFile` relations for
 *  any URL that wasn't already present in the prior version of the HTML — this
 *  is what binds the attachment to the work item permanently. */

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif)(\?|#|$)/i;
const VIDEO_EXT_RE = /\.(mp4|webm|mov|ogv|m4v)(\?|#|$)/i;
const ATTACHMENT_PATH_RE = /\/_apis\/wit\/attachments\//i;

/** Find every ADO attachment URL referenced from the HTML — both `<img src>`
 *  and `<a href>` (videos render as anchors that the renderer upgrades to
 *  `<video>` later). */
export function extractAttachmentUrls(html: string): Set<string> {
  const out = new Set<string>();
  if (!html) return out;
  const re = /(?:href|src)\s*=\s*"([^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const url = m[1];
    if (ATTACHMENT_PATH_RE.test(url)) out.add(url);
  }
  return out;
}

/** Diff old vs new HTML — returns URLs that appear in `next` but not in `prev`. */
export function newAttachmentUrls(prevHtml: string, nextHtml: string): string[] {
  const prev = extractAttachmentUrls(prevHtml);
  const next = extractAttachmentUrls(nextHtml);
  const added: string[] = [];
  next.forEach((u) => {
    if (!prev.has(u)) added.push(u);
  });
  return added;
}

/** Pull the display filename out of an ADO attachment URL. The upload endpoint
 *  echoes the original filename back via `?fileName=...`; we use that for the
 *  `attributes.name` on the AttachedFile relation. Returns empty string when
 *  the query param is absent (some redirected URLs lose it). */
export function filenameFromAttachmentUrl(url: string): string {
  try {
    const u = new URL(url, 'https://placeholder.invalid');
    return u.searchParams.get('fileName') ?? '';
  } catch {
    return '';
  }
}

/** Decide whether a file should be inserted as `<img>` or as a video anchor.
 *  Returns null for unsupported types — caller should reject the paste/drop. */
export function attachmentKindOf(file: File): 'image' | 'video' | null {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  // Fallback to extension detection — clipboard items occasionally arrive with
  // a generic application/octet-stream MIME.
  if (IMAGE_EXT_RE.test(file.name)) return 'image';
  if (VIDEO_EXT_RE.test(file.name)) return 'video';
  return null;
}
