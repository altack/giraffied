import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import type { FormControl } from '@/ado/form';
import type { AdoIdentity } from '@/ado/types';
import type { DraftValue } from './types';
import {
  BooleanWidget,
  DateTimeWidget,
  HtmlWidget,
  IdentityWidget,
  NumberWidget,
  PicklistMultiWidget,
  PicklistSingleWidget,
  PlainTextWidget,
  ReadOnlyWidget,
  StringWidget,
  TreePathWidget,
} from './widgets';

/** Generic row renderer for a layout-driven form field. Handles the label +
 *  optional help-text tooltip + required asterisk, then dispatches to the
 *  widget that matches `control.widget`. */
export function FieldRow({
  control,
  value,
  onChange,
  disabled,
  action,
}: {
  control: FormControl;
  value: DraftValue;
  onChange: (next: DraftValue) => void;
  disabled?: boolean;
  /** Optional trailing slot in the label row — used for the pin/unpin toggle.
   *  Rendered right-aligned via `ml-auto`; should be styled to reveal on
   *  hover by the caller (the FieldRow itself has no hover scope). */
  action?: ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
        <span className="truncate">{control.displayName}</span>
        {control.required && (
          <span className="text-red-300/80" aria-label="required">
            *
          </span>
        )}
        {control.helpText && (
          <span title={control.helpText} className="cursor-help text-zinc-600">
            <Info className="h-3 w-3" aria-hidden />
          </span>
        )}
        {action && <span className="ml-auto">{action}</span>}
      </div>
      <WidgetDispatcher
        control={control}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
    </div>
  );
}

function WidgetDispatcher({
  control,
  value,
  onChange,
  disabled,
}: {
  control: FormControl;
  value: DraftValue;
  onChange: (next: DraftValue) => void;
  disabled?: boolean;
}) {
  const ro = !!control.readOnly;
  if (ro) {
    return (
      <ReadOnlyWidget
        control={control}
        value={value}
        onChange={() => {}}
        disabled
      />
    );
  }
  switch (control.widget) {
    case 'string':
      return (
        <StringWidget
          control={control}
          value={asString(value)}
          onChange={(v) => onChange(v)}
          disabled={disabled}
        />
      );
    case 'integer':
    case 'double':
      return (
        <NumberWidget
          control={control}
          value={value as number | string}
          onChange={(v) => onChange(v)}
          disabled={disabled}
        />
      );
    case 'html':
      return (
        <HtmlWidget
          control={control}
          value={asString(value)}
          onChange={(v) => onChange(v)}
          disabled={disabled}
        />
      );
    case 'plainText':
      return (
        <PlainTextWidget
          control={control}
          value={asString(value)}
          onChange={(v) => onChange(v)}
          disabled={disabled}
        />
      );
    case 'picklistSingle':
      return (
        <PicklistSingleWidget
          control={control}
          value={asString(value)}
          onChange={(v) => onChange(v)}
          disabled={disabled}
        />
      );
    case 'picklistMulti':
      return (
        <PicklistMultiWidget
          control={control}
          value={asStringArray(value)}
          onChange={(v) => onChange(v)}
          disabled={disabled}
        />
      );
    case 'identity':
      return (
        <IdentityWidget
          control={control}
          value={value as AdoIdentity | null}
          onChange={(v) => onChange(v)}
          disabled={disabled}
        />
      );
    case 'dateTime':
      return (
        <DateTimeWidget
          control={control}
          value={asString(value)}
          onChange={(v) => onChange(v)}
          disabled={disabled}
        />
      );
    case 'boolean':
      return (
        <BooleanWidget
          control={control}
          value={!!value}
          onChange={(v) => onChange(v)}
          disabled={disabled}
        />
      );
    case 'treePath':
      return (
        <TreePathWidget
          control={control}
          value={value}
          onChange={(v) => onChange(v)}
          disabled={disabled}
        />
      );
    case 'readOnly':
      return (
        <ReadOnlyWidget
          control={control}
          value={value}
          onChange={() => {}}
          disabled
        />
      );
  }
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}
function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string');
  return [];
}
