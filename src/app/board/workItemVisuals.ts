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

/** Bar-segment color slots for the contributor stacked bar. Slot order mirrors
 *  AVATAR_PALETTE so the same person gets the same hue family across themes —
 *  the dark slate-blue avatar maps to the indigo bar segment, violet → violet,
 *  rose → rose, etc. The dark palette is intentionally muted (low saturation)
 *  to read as calm against the dark canvas; the light palette is the saturated
 *  500-tier so the bars actually pop on white instead of looking dusted-out. */
const CONTRIBUTOR_BAR_PALETTE_DARK: string[] = [
  '#3b4a6b', '#4c3b6b', '#6b3b4a', '#3b6b5a',
  '#6b5a3b', '#3b556b', '#5a3b6b', '#6b3b55',
];
const CONTRIBUTOR_BAR_PALETTE_LIGHT: string[] = [
  '#6366f1', // indigo-500
  '#8b5cf6', // violet-500
  '#f43f5e', // rose-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#0ea5e9', // sky-500
  '#a855f7', // purple-500
  '#ec4899', // pink-500
];

function paletteIndex(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h) % AVATAR_PALETTE.length;
}

export function avatarColor(str: string): { bg: string; fg: string } {
  return AVATAR_PALETTE[paletteIndex(str)];
}

/** Pick a contributor-bar segment color for the given name + theme. Light mode
 *  needs vivid saturated tones; dark/classic stay on the muted palette that
 *  matches the avatar circles. */
export function contributorBarColor(str: string, theme: 'classic' | 'dark' | 'light'): string {
  const palette = theme === 'light' ? CONTRIBUTOR_BAR_PALETTE_LIGHT : CONTRIBUTOR_BAR_PALETTE_DARK;
  return palette[paletteIndex(str)];
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
      // The fallback triplet flips per theme via --lane-hue-default in
      // globals.css. CSS resolves the nested var() at use time, so the
      // downstream `rgb(var(--lane-hue) / 0.045)` ends up with the right
      // tone for the current theme — visible on both dark and light canvases.
      return 'var(--lane-hue-default)';
  }
}

/** Tailwind classes for the parent-row state chip (bg + border + text), mapped
 *  by case-insensitive state name so "Done" / "DONE" / "done" all match. Falls
 *  back to a neutral white tint for custom or unknown states — better to show
 *  "QA Verified" in neutral than not at all. */
/**
 * Tonal chip styling for a work-item state. The dark-mode classes are the
 * canonical palette (low-alpha tinted background + high-saturation text).
 * Light mode uses `theme-light:*` overrides because a `text-emerald-300` over
 * a `bg-emerald-400/[0.10]` over white is illegible — light mode wants a
 * deeper text shade against a slightly heavier background tint.
 */
export function stateChipTone(state: string): string {
  const s = state.trim().toLowerCase();
  if (s === 'done' || s === 'closed' || s === 'completed') {
    return 'bg-emerald-400/[0.10] border-emerald-400/25 text-emerald-300 theme-light:bg-emerald-100 theme-light:border-emerald-700/30 theme-light:text-emerald-800';
  }
  if (s === 'resolved' || s === 'in review') {
    return 'bg-violet-400/[0.10] border-violet-400/25 text-violet-300 theme-light:bg-violet-100 theme-light:border-violet-700/30 theme-light:text-violet-800';
  }
  if (s === 'active' || s === 'in progress' || s === 'doing' || s === 'committed') {
    return 'bg-sky-400/[0.10] border-sky-400/25 text-sky-300 theme-light:bg-sky-100 theme-light:border-sky-700/30 theme-light:text-sky-800';
  }
  if (
    s === 'new' ||
    s === 'approved' ||
    s === 'ready' ||
    s === 'in planning' ||
    s === 'open tasks'
  ) {
    return 'bg-amber-400/[0.10] border-amber-400/25 text-amber-200 theme-light:bg-amber-100 theme-light:border-amber-700/30 theme-light:text-amber-800';
  }
  if (s === 'blocked' || s === 'on hold' || s === 'rejected' || s === 'cancelled') {
    return 'bg-rose-400/[0.10] border-rose-400/25 text-rose-300 theme-light:bg-rose-100 theme-light:border-rose-700/30 theme-light:text-rose-800';
  }
  if (s === 'removed') {
    return 'bg-[var(--color-overlay-soft)] border-[var(--color-hairline)] text-[var(--color-ink-dim)]';
  }
  // to do, proposed, opened, anything custom
  return 'bg-[var(--color-overlay-1)] border-[var(--color-hairline-strong)] text-[var(--color-ink)]';
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
