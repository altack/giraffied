import type { FormControl } from '@/ado/form';
import type {
  AdoFieldValue,
  AdoFieldPatch,
} from '@/ado/endpoints';
import type { AdoIdentity, AdoWorkItemFields } from '@/ado/types';
import type { DraftValue } from './widgets/types';

export type DraftRecord = Record<string, DraftValue>;

/** Hydrate a generic draft for a set of layout-driven form controls from the raw
 *  work-item fields. Each widget kind has its own extraction rule so the draft
 *  we keep in state is exactly the shape the widget expects (e.g. picklistMulti
 *  holds `string[]`, boolean holds `boolean`, identity holds `AdoIdentity`). */
export function buildInitialDraft(
  controls: FormControl[],
  fields: AdoWorkItemFields,
): DraftRecord {
  const draft: DraftRecord = {};
  for (const c of controls) {
    draft[c.referenceName] = extractValue(c, fields[c.referenceName]);
  }
  return draft;
}

function extractValue(control: FormControl, raw: unknown): DraftValue {
  switch (control.widget) {
    case 'picklistMulti':
      return splitMulti(asString(raw));
    case 'identity':
      return isIdentity(raw) ? raw : null;
    case 'boolean':
      return raw === true || raw === 'true';
    case 'integer':
    case 'double':
      return raw == null ? '' : String(raw);
    case 'html':
    case 'plainText':
    case 'string':
    case 'picklistSingle':
    case 'dateTime':
    case 'treePath':
    case 'readOnly':
      return asString(raw);
  }
}

/** Compare a draft against its original and emit the minimal set of JSON-Patch
 *  ops needed to sync the work item. Each widget kind has its own equality rule
 *  and its own value-to-wire transform — e.g. picklistMulti joins with '; ' to
 *  match how ADO's multi-value picklist extension stores its payload. */
export function diffDraft(
  controls: FormControl[],
  original: DraftRecord,
  draft: DraftRecord,
): AdoFieldPatch[] {
  const patches: AdoFieldPatch[] = [];
  for (const c of controls) {
    const o = original[c.referenceName];
    const d = draft[c.referenceName];
    if (equalForWidget(c, o, d)) continue;
    patches.push({
      field: c.referenceName,
      value: toWire(c, d),
    });
  }
  return patches;
}

function equalForWidget(control: FormControl, a: DraftValue, b: DraftValue): boolean {
  switch (control.widget) {
    case 'picklistMulti': {
      const aa = Array.isArray(a) ? a : [];
      const bb = Array.isArray(b) ? b : [];
      if (aa.length !== bb.length) return false;
      for (let i = 0; i < aa.length; i++) if (aa[i] !== bb[i]) return false;
      return true;
    }
    case 'identity': {
      const ai = isIdentity(a) ? a : null;
      const bi = isIdentity(b) ? b : null;
      return (
        (ai?.uniqueName ?? ai?.displayName ?? null) ===
        (bi?.uniqueName ?? bi?.displayName ?? null)
      );
    }
    case 'boolean':
      return !!a === !!b;
    case 'integer':
    case 'double':
      return asString(a) === asString(b);
    default:
      return asString(a) === asString(b);
  }
}

function toWire(control: FormControl, value: DraftValue): AdoFieldValue {
  switch (control.widget) {
    case 'picklistMulti': {
      const arr = Array.isArray(value) ? value : [];
      return arr.length === 0 ? null : arr.join('; ');
    }
    case 'identity': {
      const id = isIdentity(value) ? value : null;
      return id?.uniqueName ?? id?.displayName ?? null;
    }
    case 'boolean':
      // ADO accepts the literal boolean; cast through number for JSON safety.
      return value ? ('true' as unknown as string) : ('false' as unknown as string);
    case 'integer':
    case 'double': {
      const s = asString(value).trim();
      if (!s) return null;
      const n = Number(s);
      return Number.isFinite(n) ? n : null;
    }
    case 'dateTime': {
      const s = asString(value).trim();
      return s || null;
    }
    default: {
      const s = asString(value);
      return s === '' ? null : s;
    }
  }
}

/** Validate a draft against the required-field flags on its controls. Returns
 *  the first problem found so we can surface it inline without flooding the
 *  footer. Booleans are always "set", so we don't enforce required on them. */
export function validateDraft(
  controls: FormControl[],
  draft: DraftRecord,
): { error?: string } {
  for (const c of controls) {
    if (!c.required) continue;
    const v = draft[c.referenceName];
    if (isEmpty(c, v)) {
      return { error: `${c.displayName} is required` };
    }
  }
  return {};
}

function isEmpty(control: FormControl, value: DraftValue): boolean {
  switch (control.widget) {
    case 'picklistMulti':
      return !Array.isArray(value) || value.length === 0;
    case 'identity':
      return !isIdentity(value);
    case 'boolean':
      return false; // booleans are always set; ADO "required bool" usually means "set to true"
    case 'integer':
    case 'double':
      return asString(value).trim() === '';
    default:
      return asString(value).trim() === '';
  }
}

/* ── utils ───────────────────────────────────────────────────────────────── */

function asString(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

function splitMulti(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(/[;,]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function isIdentity(v: unknown): v is AdoIdentity {
  return (
    !!v &&
    typeof v === 'object' &&
    'displayName' in (v as Record<string, unknown>) &&
    typeof (v as { displayName?: unknown }).displayName === 'string'
  );
}
