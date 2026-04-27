import {
  Bold,
  Code,
  Code2,
  Heading2,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Loader2,
  Paperclip,
  Quote,
  Strikethrough,
  Underline as UnderlineIcon,
} from 'lucide-react';
import type { Editor } from '@tiptap/react';
import { cn } from '@/lib/cn';

/** Toolbar buttons use `onMouseDown` (with preventDefault) instead of `onClick`
 *  so the contenteditable doesn't lose focus while the user is clicking a
 *  formatting button. The editor command then re-focuses just to be safe. */
function ToolButton({
  active,
  disabled,
  onPress,
  label,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => {
        // Stop the click from blurring the editor; if blur fires we get a
        // visible toolbar layout shift before the click registers.
        e.preventDefault();
        if (!disabled) onPress();
      }}
      className={cn(
        'inline-grid place-items-center w-7 h-7 rounded text-[var(--color-ink-muted)]',
        'hover:bg-[var(--color-overlay-1)] hover:text-[var(--color-ink)]',
        'disabled:opacity-30 disabled:cursor-not-allowed',
        'transition-colors duration-100',
        active && 'bg-[var(--color-overlay-strong)] text-[var(--color-ink)]',
      )}
    >
      {children}
    </button>
  );
}

function ToolDivider() {
  return <span aria-hidden className="self-stretch w-px bg-[var(--color-hairline)] mx-0.5" />;
}

export function EditorToolbar({
  editor,
  pendingUploads = 0,
  onAttach,
}: {
  editor: Editor | null;
  pendingUploads?: number;
  /** When provided, the toolbar shows a paperclip button that triggers the
   *  system file picker. The actual file input lives in DescriptionEditor so
   *  the upload + insert plumbing stays in one place. */
  onAttach?: () => void;
}) {
  if (!editor) return null;

  const promptLink = () => {
    const previous = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Link URL', previous ?? 'https://');
    if (url === null) return; // cancelled
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    // Normalize bare domains so the link actually opens.
    const href = /^[a-z]+:/i.test(url) ? url : `https://${url}`;
    editor
      .chain()
      .focus()
      .extendMarkRange('link')
      .setLink({ href })
      .run();
  };

  return (
    <div
      className="jfd-tt-toolbar flex items-center gap-0.5 px-1.5 py-1 border-b border-[var(--color-hairline)] bg-[var(--color-overlay-soft)]"
      // Keep mousedown on the strip itself from blurring the editor.
      onMouseDown={(e) => e.preventDefault()}
    >
      <ToolButton
        label="Bold (Ctrl+B)"
        active={editor.isActive('bold')}
        onPress={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold size={13} />
      </ToolButton>
      <ToolButton
        label="Italic (Ctrl+I)"
        active={editor.isActive('italic')}
        onPress={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic size={13} />
      </ToolButton>
      <ToolButton
        label="Underline (Ctrl+U)"
        active={editor.isActive('underline')}
        onPress={() => editor.chain().focus().toggleUnderline().run()}
      >
        <UnderlineIcon size={13} />
      </ToolButton>
      <ToolButton
        label="Strikethrough"
        active={editor.isActive('strike')}
        onPress={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough size={13} />
      </ToolButton>
      <ToolButton
        label="Inline code"
        active={editor.isActive('code')}
        onPress={() => editor.chain().focus().toggleCode().run()}
      >
        <Code size={13} />
      </ToolButton>

      <ToolDivider />

      <ToolButton
        label="Heading"
        active={editor.isActive('heading', { level: 2 })}
        onPress={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 size={14} />
      </ToolButton>
      <ToolButton
        label="Bullet list"
        active={editor.isActive('bulletList')}
        onPress={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List size={14} />
      </ToolButton>
      <ToolButton
        label="Ordered list"
        active={editor.isActive('orderedList')}
        onPress={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered size={14} />
      </ToolButton>
      <ToolButton
        label="Quote"
        active={editor.isActive('blockquote')}
        onPress={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote size={13} />
      </ToolButton>
      <ToolButton
        label="Code block"
        active={editor.isActive('codeBlock')}
        onPress={() => editor.chain().focus().toggleCodeBlock().run()}
      >
        <Code2 size={13} />
      </ToolButton>

      <ToolDivider />

      <ToolButton
        label="Link"
        active={editor.isActive('link')}
        onPress={promptLink}
      >
        <LinkIcon size={13} />
      </ToolButton>

      {onAttach && (
        <>
          <ToolDivider />
          <ToolButton label="Attach image or video" onPress={onAttach}>
            <Paperclip size={13} />
          </ToolButton>
        </>
      )}

      {pendingUploads > 0 && (
        <div className="ml-auto flex items-center gap-1.5 pr-1 text-[11px] text-[var(--color-ink-muted)] mono">
          <Loader2 size={11} className="animate-spin" />
          <span>
            Uploading {pendingUploads} file{pendingUploads === 1 ? '' : 's'}…
          </span>
        </div>
      )}
    </div>
  );
}
