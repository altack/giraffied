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

/** RGB triplet (space-separated, for `rgb(var(--lane-hue) / X)`) keyed by
 *  parent work-item type. Drives the subtle horizontal "lane thread" that ties
 *  a swimlane's banner to its droppable cells. Values match the dot colors in
 *  workItemTypeStyle — pre-converted to triplets so they can compose with
 *  alpha at render time. Unknown / unparented lanes use a neutral white so
 *  they look the same as the pre-hue design. */
export function laneHueRgb(type: string | undefined): string {
  switch (type) {
    case 'Task':
      return '245 158 11';
    case 'Bug':
      return '239 68 68';
    case 'Story':
    case 'Product Backlog Item':
      return '56 189 248';
    case 'Issue':
      return '167 139 250';
    case 'Feature':
      return '192 132 252';
    case 'Epic':
      return '251 146 60';
    case 'Sprint Goal':
      return '52 211 153';
    default:
      return '255 255 255';
  }
}

/** Tailwind classes for the parent-row state chip (bg + border + text), mapped
 *  by case-insensitive state name so "Done" / "DONE" / "done" all match. Falls
 *  back to a neutral white tint for custom or unknown states — better to show
 *  "QA Verified" in neutral than not at all. */
export function stateChipTone(state: string): string {
  const s = state.trim().toLowerCase();
  if (s === 'done' || s === 'closed' || s === 'completed') {
    return 'bg-emerald-400/[0.10] border-emerald-400/25 text-emerald-300';
  }
  if (s === 'resolved' || s === 'in review') {
    return 'bg-violet-400/[0.10] border-violet-400/25 text-violet-300';
  }
  if (s === 'active' || s === 'in progress' || s === 'doing' || s === 'committed') {
    return 'bg-sky-400/[0.10] border-sky-400/25 text-sky-300';
  }
  if (
    s === 'new' ||
    s === 'approved' ||
    s === 'ready' ||
    s === 'in planning' ||
    s === 'open tasks'
  ) {
    return 'bg-amber-400/[0.10] border-amber-400/25 text-amber-200';
  }
  if (s === 'blocked' || s === 'on hold' || s === 'rejected' || s === 'cancelled') {
    return 'bg-rose-400/[0.10] border-rose-400/25 text-rose-300';
  }
  if (s === 'removed') {
    return 'bg-white/[0.02] border-white/[0.06] text-zinc-600';
  }
  // to do, proposed, opened, anything custom
  return 'bg-white/[0.05] border-white/[0.10] text-zinc-300';
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
