import { useState, type MouseEvent } from 'react';
import { Check, Link2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useSettings } from '@/state/settings.store';

export function workItemUrl(org: string, projectName: string, id: number): string {
  return `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(projectName)}/_workitems/edit/${id}`;
}

export function CopyLinkButton({
  workItemId,
  className,
}: {
  workItemId: number;
  className?: string;
}) {
  const org = useSettings((s) => s.org);
  const projectName = useSettings((s) => s.projectName);
  const [copied, setCopied] = useState(false);

  if (!org || !projectName) return null;
  const url = workItemUrl(org, projectName, workItemId);

  async function handleCopy(e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // Fallback for clipboard permission edge cases.
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? 'Copied!' : 'Copy link'}
      aria-label={copied ? 'Copied link to clipboard' : 'Copy link to work item'}
      className={cn(
        'inline-flex h-5 w-5 items-center justify-center rounded cursor-pointer',
        'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-overlay-2)]',
        'transition-colors duration-100',
        className,
      )}
    >
      {copied ? (
        <Check className="h-3 w-3 text-emerald-400" />
      ) : (
        <Link2 className="h-3 w-3" />
      )}
    </button>
  );
}
