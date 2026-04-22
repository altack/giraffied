export function initialsOf(displayName: string | undefined): string {
  if (!displayName) return '?';
  const parts = displayName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Deterministic avatar palette. Muted, desaturated pairs — no neon. */
const AVATAR_PALETTE: Array<{ bg: string; fg: string }> = [
  { bg: '#3b4a6b', fg: '#c7d2fe' },
  { bg: '#4c3b6b', fg: '#ddd6fe' },
  { bg: '#6b3b4a', fg: '#fecdd3' },
  { bg: '#3b6b5a', fg: '#a7f3d0' },
  { bg: '#6b5a3b', fg: '#fde68a' },
  { bg: '#3b556b', fg: '#bae6fd' },
  { bg: '#5a3b6b', fg: '#e9d5ff' },
  { bg: '#6b3b55', fg: '#fbcfe8' },
];

export function avatarColor(str: string): { bg: string; fg: string } {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}

/** Type indicator is now a single colored dot + the short label. Matches Linear's style. */
export interface WorkItemTypeVisual {
  label: string;
  dot: string; // hex color for the dot
}

export function workItemTypeStyle(type: string): WorkItemTypeVisual {
  switch (type) {
    case 'Task':
      return { label: 'Task', dot: '#f59e0b' }; // amber
    case 'Bug':
      return { label: 'Bug', dot: '#ef4444' }; // red
    case 'Story':
      return { label: 'Story', dot: '#38bdf8' }; // sky
    case 'Product Backlog Item':
      return { label: 'PBI', dot: '#38bdf8' };
    case 'Issue':
      return { label: 'Issue', dot: '#a78bfa' }; // violet
    case 'Feature':
      return { label: 'Feature', dot: '#c084fc' }; // purple
    case 'Epic':
      return { label: 'Epic', dot: '#fb923c' }; // orange
    case 'Sprint Goal':
      return { label: 'Goal', dot: '#34d399' }; // emerald
    default:
      return { label: type, dot: '#71717a' }; // zinc
  }
}

export function parseTags(tags: string | undefined): string[] {
  if (!tags) return [];
  return tags
    .split(';')
    .map((t) => t.trim())
    .filter(Boolean);
}

/** ADO stores "story points" under different field refs depending on the project's
 *  process template: Agile → StoryPoints, Scrum → Effort, CMMI → Size. This picks
 *  the right one for a work-item type so reads/writes land in the expected place. */
export const POINTS_FIELDS = [
  'Microsoft.VSTS.Scheduling.StoryPoints',
  'Microsoft.VSTS.Scheduling.Effort',
  'Microsoft.VSTS.Scheduling.Size',
] as const;

export type PointsFieldName = (typeof POINTS_FIELDS)[number];

export function pointsFieldForType(wiType: string): PointsFieldName {
  switch (wiType) {
    case 'Product Backlog Item':
    case 'Bug': // Scrum-template Bugs track Effort; Agile-template Bugs use StoryPoints
      return 'Microsoft.VSTS.Scheduling.Effort';
    case 'Requirement':
      return 'Microsoft.VSTS.Scheduling.Size';
    default:
      return 'Microsoft.VSTS.Scheduling.StoryPoints';
  }
}

/** Read the points value from a fields record. Uses the type-specific field first,
 *  then falls back to whichever sibling field happens to be populated — handles
 *  orgs that mix templates or have imported items from another process. */
export function readPoints(
  fields: Partial<Record<PointsFieldName, number | undefined>> & {
    'System.WorkItemType'?: string;
  },
): number | undefined {
  const primary = pointsFieldForType(fields['System.WorkItemType'] ?? '');
  if (fields[primary] != null) return fields[primary];
  for (const f of POINTS_FIELDS) {
    if (fields[f] != null) return fields[f];
  }
  return undefined;
}

/** Pick the field to write back to. Prefer the one currently populated on the item
 *  (so an item that has always used Effort keeps using Effort), otherwise fall back
 *  to the type-based default. */
export function writePointsFieldFor(
  fields: Partial<Record<PointsFieldName, number | undefined>> & {
    'System.WorkItemType'?: string;
  },
): PointsFieldName {
  for (const f of POINTS_FIELDS) {
    if (fields[f] != null) return f;
  }
  return pointsFieldForType(fields['System.WorkItemType'] ?? '');
}
