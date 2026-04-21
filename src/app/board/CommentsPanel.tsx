import { useEffect, useMemo, useState } from 'react';
import { Loader2, Pencil, Send, Trash2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createWorkItemComment,
  deleteWorkItemComment,
  updateWorkItemComment,
} from '@/ado/endpoints';
import { useComments } from '@/ado/hooks/useComments';
import { useCurrentUser } from '@/ado/hooks/useCurrentUser';
import type { AdoConnectionData, AdoWorkItemComment } from '@/ado/types';
import { AdoError } from '@/ado/client';
import { useSettings } from '@/state/settings.store';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { Avatar } from './Avatar';
import { DescriptionEditor } from './DescriptionEditor';
import { relativeTime } from './timeFormat';

const commentsKey = (projectId: string | null, id: number) =>
  ['workitem-comments', projectId, id] as const;

/** Treat `<div><br></div>`, `<p></p>`, whitespace etc as empty. */
function isEmptyHtml(html: string): boolean {
  const text = html
    .replace(/<br\s*\/?>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;| |\s/g, '');
  return text.length === 0;
}

/** Compare the current user against a comment's author. We check multiple
 *  identifiers because connectionData's authenticatedUser and comment.createdBy
 *  can surface different flavors of id depending on the ADO org (Graph vs Core).
 *  uniqueName (the email) is the most reliable cross-endpoint match. */
function isOwnComment(
  c: AdoWorkItemComment,
  me: AdoConnectionData['authenticatedUser'] | undefined,
): boolean {
  if (!me || !c.createdBy) return false;
  if (me.id && c.createdBy.id && me.id === c.createdBy.id) return true;
  const myEmail = (me.mailAddress ?? me.providerDisplayName ?? '').toLowerCase();
  const theirEmail = (c.createdBy.uniqueName ?? '').toLowerCase();
  if (myEmail && theirEmail && myEmail === theirEmail) return true;
  return false;
}

function formatError(err: unknown): string {
  if (err instanceof AdoError) {
    return `${err.status} ${err.statusText} — ${err.body.slice(0, 180)}`;
  }
  return err instanceof Error ? err.message : String(err);
}

export function CommentsPanel({
  workItemId,
  enabled,
}: {
  workItemId: number;
  enabled: boolean;
}) {
  const projectId = useSettings((s) => s.projectId);
  const queryClient = useQueryClient();
  const comments = useComments(workItemId, enabled);
  const me = useCurrentUser();

  const [composer, setComposer] = useState('');
  const [composerError, setComposerError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const queryKey = useMemo(() => commentsKey(projectId, workItemId), [projectId, workItemId]);

  const postComment = useMutation({
    mutationFn: async (text: string) => {
      if (!projectId) throw new Error('Missing project');
      return createWorkItemComment(projectId, workItemId, text);
    },
    onSuccess: (created) => {
      queryClient.setQueryData<AdoWorkItemComment[]>(queryKey, (prev) =>
        prev ? [...prev, created] : [created],
      );
      setComposer('');
      setComposerError(null);
    },
    onError: (err) => {
      setComposerError(formatError(err));
    },
  });

  const editComment = useMutation({
    mutationFn: async ({ id, text }: { id: number; text: string }) => {
      if (!projectId) throw new Error('Missing project');
      return updateWorkItemComment(projectId, workItemId, id, text);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<AdoWorkItemComment[]>(queryKey, (prev) =>
        prev ? prev.map((c) => (c.commentId === updated.commentId ? updated : c)) : prev,
      );
      setEditingId(null);
      setActionError(null);
    },
    onError: (err) => {
      setActionError(formatError(err));
    },
  });

  const removeComment = useMutation({
    mutationFn: async (id: number) => {
      if (!projectId) throw new Error('Missing project');
      await deleteWorkItemComment(projectId, workItemId, id);
      return id;
    },
    onMutate: async (id) => {
      const prev = queryClient.getQueryData<AdoWorkItemComment[]>(queryKey);
      queryClient.setQueryData<AdoWorkItemComment[]>(queryKey, (cur) =>
        cur ? cur.filter((c) => c.commentId !== id) : cur,
      );
      return { prev };
    },
    onSuccess: () => setActionError(null),
    onError: (err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev);
      setActionError(formatError(err));
    },
  });

  function handleSend() {
    setComposerError(null);
    if (isEmptyHtml(composer)) {
      setComposerError('Write something first.');
      return;
    }
    postComment.mutate(composer);
  }

  // Newest first so a freshly-posted comment sits right under the composer.
  const ordered = useMemo(() => {
    const list = comments.data ?? [];
    return list
      .slice()
      .sort(
        (a, b) =>
          new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime(),
      );
  }, [comments.data]);

  return (
    <div className="flex flex-col gap-4">
      <div
        id="comments-composer"
        className="rounded-md border border-white/[0.06] bg-white/[0.02] p-2 space-y-2"
      >
        <DescriptionEditor
          value={composer}
          onChange={setComposer}
          placeholder="Write a comment…"
          variant="minimal"
        />
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            {composerError && (
              <div className="text-[11px] text-red-300/80 mono truncate">
                {composerError}
              </div>
            )}
          </div>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleSend}
            disabled={postComment.isPending || isEmptyHtml(composer)}
          >
            {postComment.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Comment
          </Button>
        </div>
      </div>

      {actionError && (
        <div className="text-[11px] text-red-300/80 mono">{actionError}</div>
      )}

      {comments.isLoading ? (
        <div className="text-[12px] text-zinc-500 flex items-center gap-1.5 py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading comments…
        </div>
      ) : comments.isError ? (
        <div className="text-[12px] text-red-300/80 py-2">
          Couldn't load comments.
        </div>
      ) : ordered.length === 0 ? (
        <div className="text-[12px] text-zinc-600 py-2">
          No comments yet. Start the conversation above.
        </div>
      ) : (
        <ul className="divide-y divide-white/[0.04] rounded-md border border-white/[0.06] bg-white/[0.015]">
          {ordered.map((c) => (
            <li key={c.commentId}>
              <CommentRow
                comment={c}
                mine={isOwnComment(c, me.data?.authenticatedUser)}
                editing={editingId === c.commentId}
                isSavingEdit={
                  editComment.isPending && editComment.variables?.id === c.commentId
                }
                onStartEdit={() => {
                  setEditingId(c.commentId);
                  setActionError(null);
                }}
                onCancelEdit={() => setEditingId(null)}
                onSaveEdit={(text) => editComment.mutate({ id: c.commentId, text })}
                onDelete={() => {
                  if (confirm('Delete this comment?')) {
                    removeComment.mutate(c.commentId);
                  }
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CommentRow({
  comment,
  mine,
  editing,
  isSavingEdit,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
}: {
  comment: AdoWorkItemComment;
  mine: boolean;
  editing: boolean;
  isSavingEdit: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (text: string) => void;
  onDelete: () => void;
}) {
  const author = comment.createdBy;
  const edited =
    comment.modifiedDate && comment.modifiedDate !== comment.createdDate;

  return (
    <div className="group flex items-start gap-2.5 px-3 py-2.5">
      <div className="pt-0.5">
        <Avatar identity={author} size="sm" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-[12.5px] font-medium text-zinc-200 truncate max-w-[220px]">
            {mine ? 'You' : author?.displayName ?? 'Someone'}
          </span>
          <span className="text-[11px] text-zinc-600 mono">
            {relativeTime(comment.createdDate)}
          </span>
          {edited && (
            <span className="text-[11px] text-zinc-700 italic">edited</span>
          )}
          {!editing && mine && (
            <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-100">
              <RowAction icon={<Pencil className="h-3 w-3" />} onClick={onStartEdit}>
                Edit
              </RowAction>
              <RowAction
                icon={<Trash2 className="h-3 w-3" />}
                onClick={onDelete}
                variant="danger"
              >
                Delete
              </RowAction>
            </div>
          )}
        </div>
        {editing ? (
          <EditableBody
            initial={comment.text}
            onCancel={onCancelEdit}
            onSave={onSaveEdit}
            busy={isSavingEdit}
          />
        ) : (
          <div
            className="jfd-comment-body mt-1 text-[13px] leading-[1.5] text-zinc-200"
            // ADO-stored HTML is trusted here (authenticated org, Trix-written).
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: comment.text }}
          />
        )}
      </div>
    </div>
  );
}

function EditableBody({
  initial,
  onCancel,
  onSave,
  busy,
}: {
  initial: string;
  onCancel: () => void;
  onSave: (text: string) => void;
  busy: boolean;
}) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    setValue(initial);
  }, [initial]);
  return (
    <>
      <div className="mt-1.5">
        <DescriptionEditor
          value={value}
          onChange={setValue}
          variant="minimal"
          autoFocus
        />
      </div>
      <div className="mt-2 flex items-center justify-end gap-1.5">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="default"
          size="sm"
          disabled={busy || isEmptyHtml(value) || value === initial}
          onClick={() => onSave(value)}
        >
          {busy && <Loader2 className="h-3 w-3 animate-spin" />}
          Save
        </Button>
      </div>
    </>
  );
}

function RowAction({
  icon,
  onClick,
  children,
  variant,
}: {
  icon: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
  variant?: 'danger';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 h-5 text-[10.5px]',
        'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05]',
        'transition-colors duration-100',
        variant === 'danger' && 'hover:text-red-300 hover:bg-red-500/10',
      )}
    >
      {icon}
      {children}
    </button>
  );
}
