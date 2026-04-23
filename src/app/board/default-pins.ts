import type { FormControl } from '@/ado/form';

/** Per-type display-name defaults for the "Pinned" sidebar section. Match is
 *  case-insensitive and accepts prefixed labels (e.g. "Digital Platforms
 *  Environment" still resolves against "environment") so the logic is portable
 *  across orgs with different custom-field naming conventions. Work-item types
 *  not listed here get no automatic pins; the user can pin what they want. */
const DEFAULTS_BY_TYPE: Record<string, string[]> = {
  Bug: ['Severity', 'Environment', 'Bug/Hotfix'],
};

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

function matchesDisplayName(displayName: string, target: string): boolean {
  const d = normalize(displayName);
  const t = normalize(target);
  return d === t || d.endsWith(' ' + t) || d.endsWith('/' + t);
}

/** Resolve which of this type's default pin targets exist on the current form
 *  layout. Returns their reference names, in the order they're listed in
 *  DEFAULTS_BY_TYPE so the sidebar order is stable across renders. */
export function resolveDefaultPins(
  wiType: string,
  sidebarControls: FormControl[],
): string[] {
  const targets = DEFAULTS_BY_TYPE[wiType] ?? [];
  const out: string[] = [];
  for (const target of targets) {
    const hit = sidebarControls.find((c) => matchesDisplayName(c.displayName, target));
    if (hit) out.push(hit.referenceName);
  }
  return out;
}
