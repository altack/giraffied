import { useEffect, useState } from 'react';
import type { AdoIdentity } from '@/ado/types';
import { cn } from '@/lib/cn';
import { avatarColor, initialsOf } from './workItemVisuals';

type Size = 'xs' | 'sm';

const SIZE_CLASS: Record<Size, string> = {
  xs: 'h-4 w-4 text-[9px]',
  sm: 'h-5 w-5 text-[10px]',
};

type ImgStatus = 'pending' | 'loaded' | 'failed';

/**
 * Avatar lives in a relative span that always renders initials underneath.
 * If `identity.imageUrl` is provided, we try to load it via a plain <img> —
 * the browser sends the dev.azure.com session cookie for cross-origin image
 * requests, which is the same auth the native ADO UI uses. No PAT scope
 * required. On load, we fade the image in; on error, initials stay visible.
 */
export function Avatar({
  identity,
  size = 'sm',
}: {
  identity: AdoIdentity | undefined;
  size?: Size;
}) {
  const imageUrl = identity?.imageUrl;
  const [status, setStatus] = useState<ImgStatus>('pending');

  useEffect(() => {
    setStatus('pending');
  }, [imageUrl]);

  if (!identity?.displayName) {
    return (
      <span
        className={cn(
          'inline-flex items-center justify-center rounded-full border border-dashed border-white/10 text-zinc-600 shrink-0',
          SIZE_CLASS[size],
        )}
        title="Unassigned"
        aria-label="Unassigned"
      >
        ?
      </span>
    );
  }

  const { bg, fg } = avatarColor(identity.displayName);
  const initials = initialsOf(identity.displayName);
  const showImage = !!imageUrl && status !== 'failed';

  return (
    <span
      className={cn(
        'relative inline-flex items-center justify-center rounded-full font-semibold overflow-hidden shrink-0',
        SIZE_CLASS[size],
      )}
      style={{ backgroundColor: bg, color: fg }}
      title={identity.displayName}
      aria-label={identity.displayName}
    >
      <span aria-hidden>{initials}</span>
      {showImage && (
        <img
          src={imageUrl}
          alt=""
          aria-hidden
          draggable={false}
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('failed')}
          className={cn(
            'absolute inset-0 h-full w-full object-cover transition-opacity duration-150',
            status === 'loaded' ? 'opacity-100' : 'opacity-0',
          )}
        />
      )}
    </span>
  );
}
