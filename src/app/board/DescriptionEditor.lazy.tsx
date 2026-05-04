import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { EditorContent, useEditor } from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { cn } from '@/lib/cn';
import { fetchAndCacheBlob, getCachedBlobUrl } from './adoImageAuth';
import { EditorToolbar } from './EditorToolbar';
import { attachmentKindOf, isAdoAttachmentUrl } from './attachments';
import { convertMarkdownImages } from './markdownImg';

type EditorVariant = 'default' | 'plain' | 'minimal';

export type UploadedAttachment = { url: string; name: string; kind: 'image' | 'video' };

/** Image extension with a DOM NodeView that wraps each image in a hover-
 *  revealed "× delete" button AND forces a NodeSelection on click. Relying
 *  on Tiptap's default click-to-NodeSelection for atom nodes turned out to
 *  be inconsistent: users would click an image, press Backspace, and see
 *  nothing change because the click had placed a TextSelection adjacent to
 *  the image instead. An explicit delete affordance + deterministic click
 *  selection means Backspace/Delete work either way, and the user always
 *  has a visible escape hatch.
 *
 *  The wrapper is a nodeView concern only — `renderHTML` is unchanged, so
 *  the serialized output is still a bare `<img>` (what ADO expects). */
const DeletableImage = Image.extend({
  addNodeView() {
    return ({ node, editor, getPos, HTMLAttributes }) => {
      const wrap = document.createElement('span');
      wrap.className = 'jfd-tt-image-wrap';
      wrap.contentEditable = 'false';

      const img = document.createElement('img');
      const attrs = { ...this.options.HTMLAttributes, ...HTMLAttributes };
      // getHTML() serializes from the node's attrs (still the original ADO
      // URL), not from the DOM — the blob URL is purely a display detail.
      const abortController = new AbortController();
      for (const [key, value] of Object.entries(attrs)) {
        if (value == null) continue;
        if (key === 'src' && isAdoAttachmentUrl(String(value))) {
          const url = String(value);
          const cached = getCachedBlobUrl(url);
          if (cached) {
            img.setAttribute('src', cached);
          } else {
            fetchAndCacheBlob(url, abortController.signal).then((blobUrl) => {
              if (abortController.signal.aborted) return;
              if (blobUrl) img.setAttribute('src', blobUrl);
            });
          }
          continue;
        }
        img.setAttribute(key, String(value));
      }
      wrap.appendChild(img);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'jfd-tt-image-delete';
      btn.setAttribute('aria-label', 'Delete image');
      btn.textContent = '×';
      wrap.appendChild(btn);

      const deleteImage = () => {
        const pos = typeof getPos === 'function' ? getPos() : null;
        if (pos == null) return;
        editor.view.dispatch(
          editor.state.tr.delete(pos, pos + node.nodeSize),
        );
        editor.view.focus();
      };

      // mousedown so the editor's contenteditable doesn't blur first; also
      // stop propagation so ProseMirror doesn't interpret the click as a
      // text-selection change.
      btn.addEventListener('mousedown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        deleteImage();
      });

      // Force NodeSelection on click — matches users' intuition that
      // "clicked the image, pressed Backspace = gone."
      img.addEventListener('mousedown', (event) => {
        if (!editor.isEditable) return;
        event.preventDefault();
        const pos = typeof getPos === 'function' ? getPos() : null;
        if (pos == null) return;
        const selection = NodeSelection.create(editor.state.doc, pos);
        editor.view.dispatch(editor.state.tr.setSelection(selection));
        editor.view.focus();
      });

      return {
        dom: wrap,
        // Atom leaf — nothing for ProseMirror to reconcile inside.
        ignoreMutation: () => true,
        // Cache outlives the nodeView; only abort our own pending fetch.
        destroy: () => abortController.abort(),
      };
    };
  },
});

/** Tiptap-backed rich text editor. Same surface as the previous Trix-backed
 *  implementation, plus an optional `uploadFile` for paste/drop attachments.
 *
 *  StarterKit (v3+) bundles Bold/Italic/Strike/Code/Underline/Link/Lists/
 *  Blockquote/Heading/CodeBlock/HardBreak/HorizontalRule/History/Dropcursor/
 *  Gapcursor/ListKeymap. We add Image and Placeholder.
 *
 *  `variant`:
 *   - `default` (form field): toolbar always visible
 *   - `plain` (description): no border, toolbar revealed on first focus
 *   - `minimal` (comment composer): bordered, toolbar revealed on first focus
 *
 *  Once the toolbar reveals (variants other than `default`), it stays visible
 *  for the rest of the editor's lifetime. This avoids the layout-shift race
 *  where a Send/Save button below the editor jumps as the user clicks it.
 *  The wrapper is keyed on the parent (e.g. WorkItemModal keys on workItem.id),
 *  so the unlocked state resets when the user switches tasks.
 */
export function DescriptionEditor({
  value,
  onChange,
  onEscape,
  uploadFile,
  placeholder = 'Describe this work item…',
  className,
  variant = 'default',
  autoFocus = false,
}: {
  value: string;
  onChange: (html: string) => void;
  /** Called when the user presses Esc inside the editor. The editor blurs and
   *  collapses its toolbar regardless; this callback is for the parent to
   *  restore its own initial state (e.g. DescriptionField returning to view
   *  mode). When provided, Esc is also stopped from bubbling to ancestor
   *  keydown listeners (the modal's window-level Esc → close). */
  onEscape?: () => void;
  /** When provided, paste/drop of image or video files uploads them as ADO
   *  attachments and inserts the result inline. The returned URL is what the
   *  editor embeds in the HTML; the parent is responsible for adding an
   *  AttachedFile relation on save (see attachments.ts). */
  uploadFile?: (file: File) => Promise<UploadedAttachment>;
  placeholder?: string;
  className?: string;
  variant?: EditorVariant;
  autoFocus?: boolean;
}) {
  const [unlocked, setUnlocked] = useState(false);
  const [pendingUploads, setPendingUploads] = useState(0);
  // useEditor captures its options at mount time, so we read the latest
  // callbacks via refs instead of recreating the editor on every render.
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;
  const uploadRef = useRef(uploadFile);
  uploadRef.current = uploadFile;
  // Mirror pendingUploads into a ref so the Esc handler (captured at useEditor
  // construction) can gate on the latest value without being recreated.
  const pendingRef = useRef(0);
  const bumpPending = useCallback((delta: number) => {
    pendingRef.current = Math.max(0, pendingRef.current + delta);
    setPendingUploads(pendingRef.current);
  }, []);

  const insertAttachment = useCallback(
    (editor: Editor, att: UploadedAttachment) => {
      // If the modal closed (or the user toggled Description back to view mode)
      // between paste and upload completion, the editor is destroyed. Inserting
      // would silently no-op — surface it instead so the upload isn't a black hole.
      if (editor.isDestroyed) {
        console.warn('jfd: attachment upload finished after editor was destroyed', att.url);
        return;
      }
      if (att.kind === 'image') {
        editor
          .chain()
          .focus()
          .setImage({ src: att.url, alt: att.name })
          .run();
      } else {
        // Videos render as `<video controls>` via RichTextRenderer's anchor →
        // video upgrade (any href ending in .mp4/.webm/.mov/.ogv/.m4v). In
        // edit mode they appear as a normal link.
        editor
          .chain()
          .focus()
          .insertContent({
            type: 'text',
            text: att.name,
            marks: [{ type: 'link', attrs: { href: att.url } }],
          })
          .insertContent(' ')
          .run();
      }
    },
    [],
  );

  const uploadAndInsert = useCallback(
    async (editor: Editor, files: File[]) => {
      const upload = uploadRef.current;
      if (!upload) return;
      const accepted = files
        .map((f) => ({ file: f, kind: attachmentKindOf(f) }))
        .filter((x): x is { file: File; kind: 'image' | 'video' } => x.kind !== null);
      if (accepted.length === 0) return;
      bumpPending(accepted.length);
      // Run uploads in parallel — paste of a single screenshot is the common
      // case, but multi-file drops shouldn't serialize.
      await Promise.all(
        accepted.map(async ({ file }) => {
          try {
            const result = await upload(file);
            insertAttachment(editor, result);
          } catch (err) {
            // Surface the failure but don't block the rest of the batch.
            console.error('attachment upload failed', err);
            window.alert(
              `Couldn't upload ${file.name}: ${err instanceof Error ? err.message : String(err)}`,
            );
          } finally {
            bumpPending(-1);
          }
        }),
      );
    },
    [insertAttachment, bumpPending],
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // We use our own toolbar's link prompt; clicking a link inside the
        // editor should just place the cursor there, not navigate.
        link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } },
      }),
      // Inline so the image lives inside a paragraph — Backspace/Delete remove
      // it naturally (as if it were a character). Block-level images would
      // require the user to click precisely on the image to get a NodeSelection,
      // which is inconsistent in practice. ADO's native editor also treats
      // pasted screenshots as inline.
      DeletableImage.configure({ inline: true, allowBase64: false }),
      Placeholder.configure({ placeholder }),
    ],
    // Pre-rewrite markdown image syntax to <img> so Tiptap parses real images
    // on initial mount; otherwise `![alt](url)` would arrive as plain text.
    content: convertMarkdownImages(value),
    autofocus: autoFocus ? 'end' : false,
    // Recommended for SSR-safe and HMR-stable mount; we also need it to avoid
    // a flash of unparsed HTML on the very first render in a fresh modal.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        // The editor body uses the same content styles as the read-only
        // renderer, so HTML round-trips look identical edit ↔ view.
        class: cn('jfd-tt-content jfd-description-body focus:outline-none px-3 py-2'),
      },
      handleKeyDown: (view, event) => {
        if (event.key !== 'Escape') return false;
        // The modal listens for Esc on `window`, so a React-level
        // stopPropagation isn't enough — we need the native event to stop
        // before the bubble reaches the window listener.
        event.preventDefault();
        event.stopPropagation();
        // Don't exit the editor while attachments are still uploading — the
        // upload's insertAttachment would land after the editor was destroyed
        // (by DescriptionField flipping back to view mode) and the image would
        // silently vanish. The toolbar's "Uploading N files…" label is the
        // user-visible feedback that Esc is deliberately held.
        if (pendingRef.current > 0) return true;
        view.dom.blur();
        setUnlocked(false);
        onEscapeRef.current?.();
        return true;
      },
      handlePaste: (_view, event) => {
        if (!uploadRef.current) return false;
        const files = Array.from(event.clipboardData?.files ?? []);
        const accepted = files.filter((f) => attachmentKindOf(f) !== null);
        if (accepted.length === 0) return false;
        event.preventDefault();
        // The Tiptap editor instance isn't reachable from here directly (we're
        // inside its own options at construction time). Microtask-defer so the
        // ref is populated by the time we insert.
        queueMicrotask(() => {
          if (editorRef.current) void uploadAndInsert(editorRef.current, accepted);
        });
        return true;
      },
      handleDrop: (_view, event, _slice, moved) => {
        if (moved || !uploadRef.current) return false;
        const files = Array.from(event.dataTransfer?.files ?? []);
        const accepted = files.filter((f) => attachmentKindOf(f) !== null);
        if (accepted.length === 0) return false;
        event.preventDefault();
        queueMicrotask(() => {
          if (editorRef.current) void uploadAndInsert(editorRef.current, accepted);
        });
        return true;
      },
    },
    onCreate: () => {
      // For variants whose toolbar is autofocus-driven, reflect that initial
      // focus immediately so the toolbar isn't a click behind.
      if (autoFocus) setUnlocked(true);
    },
    onFocus: () => setUnlocked(true),
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  // Mirror the editor instance into a ref so the paste/drop handlers (defined
  // inside useEditor options at construction time) can reach it.
  const editorRef = useRef<Editor | null>(null);
  editorRef.current = editor;

  // Hidden file input behind the toolbar's paperclip button. Reset value after
  // each pick so re-selecting the same file fires onChange again.
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const onAttachClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);
  const onFilesChosen = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = '';
      if (files.length === 0 || !editorRef.current) return;
      void uploadAndInsert(editorRef.current, files);
    },
    [uploadAndInsert],
  );

  // Push external value changes (form reset, switching task) into the editor,
  // but skip when the value already matches what we'd emit — comparing avoids
  // the cursor-reset that happens whenever setContent runs. Compare against
  // the *transformed* value: the editor's getHTML() returns img tags, while
  // the incoming value may still carry markdown image syntax — without the
  // transform here, those would never compare equal and we'd reset the cursor
  // on every render.
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const next = convertMarkdownImages(value);
    if (current === next) return;
    // emitUpdate:false skips the onUpdate callback so we don't loop on our own
    // value prop. (Tiptap v3 changed this from a positional boolean to an
    // options object.)
    editor.commands.setContent(next || '', { emitUpdate: false });
  }, [editor, value]);

  const showToolbar = variant === 'default' || unlocked;

  return (
    <div
      className={cn(
        'jfd-tt rounded-md overflow-hidden transition-colors duration-150',
        variant === 'default' &&
          'border border-white/[0.08] bg-white/[0.03] focus-within:border-indigo-400/40 focus-within:ring-2 focus-within:ring-indigo-400/15',
        variant === 'plain' &&
          'border border-transparent hover:bg-white/[0.02] focus-within:bg-white/[0.03] focus-within:border-indigo-400/40 focus-within:ring-2 focus-within:ring-indigo-400/15',
        variant === 'minimal' &&
          'border border-white/[0.08] bg-white/[0.03] focus-within:border-indigo-400/40 focus-within:ring-2 focus-within:ring-indigo-400/15',
        className,
      )}
    >
      {showToolbar && (
        <EditorToolbar
          editor={editor}
          pendingUploads={pendingUploads}
          onAttach={uploadFile ? onAttachClick : undefined}
        />
      )}
      <EditorContent editor={editor} />
      {uploadFile && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          hidden
          onChange={onFilesChosen}
        />
      )}
    </div>
  );
}
