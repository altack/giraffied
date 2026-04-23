/** Replace standalone markdown image syntax `![alt](url)` with a bare `<img>`
 *  tag. ADO sometimes stores descriptions/comments in markdown form (e.g. when
 *  the user pasted from a markdown source or an integration wrote it that way).
 *  Full markdown is not supported — this is a targeted affordance so images at
 *  least render properly in both the read-only renderer and the editor.
 *
 *  The first edit round-trips the HTML through Tiptap, which serializes the
 *  result as a real `<img>` tag — so saved-back content drops the markdown form
 *  on its own without an explicit migration. */
export function convertMarkdownImages(html: string): string {
  if (!html || html.indexOf('![') < 0) return html;
  return html.replace(
    /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
    (_match, alt: string, url: string, title?: string) =>
      `<img src="${escapeAttr(url)}" alt="${escapeAttr(alt)}"${
        title ? ` title="${escapeAttr(title)}"` : ''
      }>`,
  );
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
