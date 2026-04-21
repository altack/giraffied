import { useAvatar } from '@/ado/hooks/useAvatar';
import type { AdoIdentity } from '@/ado/types';
import { cn } from '@/lib/cn';
import { avatarColor, initialsOf } from './workItemVisuals';

type Size = 'xs' | 'sm';

const SIZE_CLASS: Record<Size, string> = {
  xs: 'h-4 w-4 text-[9px]',
  sm: 'h-5 w-5 text-[10px]',
};

export function Avatar({
  identity,
  size = 'sm',
}: {
  identity: AdoIdentity | undefined;
  size?: Size;
}) {
  const { data: objectUrl } = useAvatar(identity?.imageUrl);

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

  if (objectUrl) {
    return (
      <img
        src={objectUrl}
        alt={identity.displayName}
        title={identity.displayName}
        className={cn('inline-block rounded-full object-cover shrink-0', SIZE_CLASS[size])}
        draggable={false}
      />
    );
  }

  const { bg, fg } = avatarColor(identity.displayName);
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full font-semibold shrink-0',
        SIZE_CLASS[size],
      )}
      style={{ backgroundColor: bg, color: fg }}
      title={identity.displayName}
      aria-label={identity.displayName}
    >
      {initialsOf(identity.displayName)}
    </span>
  );
}
