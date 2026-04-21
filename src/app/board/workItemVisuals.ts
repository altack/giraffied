export function initialsOf(displayName: string | undefined): string {
  if (!displayName) return '?';
  const parts = displayName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** A stable hue from a string, for color-coding avatars. */
export function hueFrom(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

/** Visual styling per ADO work item type. Covers Scrum, Agile, Basic, CMMI. */
export function workItemTypeStyle(type: string): {
  label: string;
  bg: string;
  fg: string;
  border: string;
} {
  switch (type) {
    case 'Task':
      return { label: 'Task', bg: 'bg-amber-500/15', fg: 'text-amber-200', border: 'border-amber-500/30' };
    case 'Bug':
      return { label: 'Bug', bg: 'bg-red-500/15', fg: 'text-red-200', border: 'border-red-500/30' };
    case 'User Story':
      return { label: 'Story', bg: 'bg-sky-500/15', fg: 'text-sky-200', border: 'border-sky-500/30' };
    case 'Product Backlog Item':
      return { label: 'PBI', bg: 'bg-sky-500/15', fg: 'text-sky-200', border: 'border-sky-500/30' };
    case 'Issue':
      return {
        label: 'Issue',
        bg: 'bg-violet-500/15',
        fg: 'text-violet-200',
        border: 'border-violet-500/30',
      };
    case 'Feature':
      return {
        label: 'Feature',
        bg: 'bg-purple-500/15',
        fg: 'text-purple-200',
        border: 'border-purple-500/30',
      };
    case 'Epic':
      return {
        label: 'Epic',
        bg: 'bg-orange-500/15',
        fg: 'text-orange-200',
        border: 'border-orange-500/30',
      };
    default:
      return {
        label: type,
        bg: 'bg-zinc-500/15',
        fg: 'text-zinc-200',
        border: 'border-zinc-500/30',
      };
  }
}

export function parseTags(tags: string | undefined): string[] {
  if (!tags) return [];
  return tags
    .split(';')
    .map((t) => t.trim())
    .filter(Boolean);
}
