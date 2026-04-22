import type { MouseEvent } from 'react';
import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useSettings } from '@/state/settings.store';
import { workItemUrl } from './CopyLinkButton';

/** Sibling to CopyLinkButton — opens the work item in a new tab in the native
 *  ADO UI. Shares the same URL shape and the same small icon-button footprint
 *  so the two sit together cleanly. Uses `window.open` with noopener/noreferrer
 *  rather than an <a target=_blank> so the button matches CopyLinkButton
 *  structurally (same click-suppression contract). */
export function OpenLinkButton({
  workItemId,
  className,
}: {
  workItemId: number;
  className?: string;
}) {
  const org = useSettings((s) => s.org);
  const projectName = useSettings((s) => s.projectName);

  if (!org || !projectName) return null;
  const url = workItemUrl(org, projectName, workItemId);

  function handleOpen(e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    e.preventDefault();
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <button
      type="button"
      onClick={handleOpen}
      title="Open in Azure DevOps"
      aria-label="Open work item in Azure DevOps"
      className={cn(
        'inline-flex h-5 w-5 items-center justify-center rounded',
        'text-zinc-500 hover:text-zinc-100 hover:bg-white/[0.08]',
        'transition-colors duration-100',
        className,
      )}
    >
      <ExternalLink className="h-3 w-3" />
    </button>
  );
}
