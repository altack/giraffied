import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import type { AdoIdentity } from '@/ado/types';
import { AssigneePicker } from '../AssigneePicker';
import { DescriptionField } from '../DescriptionField';
import { MultiPicklistPicker } from '../MultiPicklistPicker';
import { PicklistPicker } from '../PicklistPicker';
import { RichTextRenderer } from '../RichTextRenderer';
import type { WidgetProps } from './types';

const POSITIVE_OR_SIGNED = /^-?\d*\.?\d*$/;

/* ── String ─────────────────────────────────────────────────────────────── */

export function StringWidget({
  value,
  onChange,
  disabled,
  control,
}: WidgetProps<string>) {
  return (
    <Input
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled || control.readOnly}
      placeholder={control.readOnly ? '' : '—'}
    />
  );
}

/* ── Number (integer / double) ──────────────────────────────────────────── */

export function NumberWidget({
  value,
  onChange,
  disabled,
  control,
}: WidgetProps<number | string>) {
  // Held as a string in the draft (matches Story Points) so we don't lose the
  // user's in-progress typing ("1." before they've typed the next digit) and
  // can distinguish empty-string from 0.
  const s = value == null ? '' : String(value);
  return (
    <Input
      inputMode="decimal"
      value={s}
      onChange={(e) => {
        const v = e.target.value;
        if (v === '' || POSITIVE_OR_SIGNED.test(v)) onChange(v);
      }}
      onKeyDown={(e) => {
        if (e.key === 'e' || e.key === 'E' || e.key === '+') e.preventDefault();
      }}
      disabled={disabled || control.readOnly}
      placeholder="—"
      className="w-32"
    />
  );
}

/* ── HTML / PlainText ────────────────────────────────────────────────────── */

export function HtmlWidget({
  value,
  onChange,
  disabled,
  control,
  uploadFile,
}: WidgetProps<string>) {
  if (disabled || control.readOnly) {
    return (
      <RichTextRenderer
        html={value ?? ''}
        className="jfd-description-body text-[13px] text-zinc-300 max-w-none"
      />
    );
  }
  return (
    <DescriptionField
      value={value ?? ''}
      onChange={onChange}
      uploadFile={uploadFile}
      placeholder={`Add ${control.displayName.toLowerCase()}…`}
    />
  );
}

export function PlainTextWidget({
  value,
  onChange,
  disabled,
  control,
}: WidgetProps<string>) {
  return (
    <textarea
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled || control.readOnly}
      rows={3}
      className={cn(
        'w-full field-sizing-content rounded-md px-3 py-2 resize-none',
        'text-[13px] text-zinc-100 placeholder:text-zinc-600',
        'bg-white/[0.03] border border-white/[0.08]',
        'focus-visible:outline-none focus-visible:border-indigo-400/50 focus-visible:ring-2 focus-visible:ring-indigo-400/20',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'transition-colors duration-150',
      )}
    />
  );
}

/* ── Picklist (single / multi) ──────────────────────────────────────────── */

export function PicklistSingleWidget({
  value,
  onChange,
  disabled,
  control,
}: WidgetProps<string>) {
  return (
    <PicklistPicker
      value={value ?? ''}
      options={control.allowedValues ?? []}
      onChange={onChange}
      disabled={disabled || control.readOnly}
    />
  );
}

export function PicklistMultiWidget({
  value,
  onChange,
  disabled,
  control,
}: WidgetProps<string[]>) {
  return (
    <MultiPicklistPicker
      values={value ?? []}
      options={control.allowedValues ?? []}
      onChange={onChange}
      disabled={disabled || control.readOnly}
      placeholder={
        (control.allowedValues ?? []).length === 0
          ? 'No values defined in ADO'
          : 'None'
      }
    />
  );
}

/* ── Identity ───────────────────────────────────────────────────────────── */

export function IdentityWidget({
  value,
  onChange,
  disabled,
  control,
}: WidgetProps<AdoIdentity | null>) {
  return (
    <AssigneePicker
      value={value ?? null}
      onChange={(next) => onChange(next as AdoIdentity | null)}
      boardAssignees={[]}
      disabled={disabled || control.readOnly}
    />
  );
}

/* ── DateTime ──────────────────────────────────────────────────────────── */

export function DateTimeWidget({
  value,
  onChange,
  disabled,
  control,
}: WidgetProps<string>) {
  // ADO returns/accepts ISO 8601. The native control wants `YYYY-MM-DDTHH:mm`;
  // we slice to that when rendering and re-expand to a full ISO on change.
  const local = value ? value.slice(0, 16) : '';
  return (
    <input
      type="datetime-local"
      value={local}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v ? new Date(v).toISOString() : '');
      }}
      disabled={disabled || control.readOnly}
      className={cn(
        'h-8 w-full rounded-md px-3 text-[13px] text-zinc-100',
        'bg-white/[0.03] border border-white/[0.08]',
        '[color-scheme:dark]',
        'focus-visible:outline-none focus-visible:border-indigo-400/50 focus-visible:ring-2 focus-visible:ring-indigo-400/20',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'transition-colors duration-150',
      )}
    />
  );
}

/* ── Boolean ────────────────────────────────────────────────────────────── */

export function BooleanWidget({
  value,
  onChange,
  disabled,
  control,
}: WidgetProps<boolean>) {
  return (
    <label className="inline-flex items-center gap-2 text-[13px] text-zinc-200 select-none cursor-pointer">
      <input
        type="checkbox"
        checked={!!value}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled || control.readOnly}
        className={cn(
          'h-4 w-4 rounded accent-indigo-400',
          'bg-white/[0.03] border border-white/[0.08]',
        )}
      />
      <span className="text-zinc-400">Yes</span>
    </label>
  );
}

/* ── ReadOnly / TreePath ────────────────────────────────────────────────── */

export function ReadOnlyWidget({ value, control }: WidgetProps) {
  let formatted: string;
  if (value == null || value === '') formatted = '—';
  else if (Array.isArray(value)) formatted = value.join(', ');
  else if (typeof value === 'object' && 'displayName' in value)
    formatted = value.displayName;
  else formatted = String(value);
  return (
    <div
      className={cn(
        'w-full h-8 flex items-center px-2.5 text-[13px] text-zinc-300',
        'bg-white/[0.02] border border-white/[0.06] rounded-md',
      )}
      title={control.helpText ?? formatted}
    >
      <span className="truncate">{formatted}</span>
    </div>
  );
}

/** Area / Iteration paths. A proper tree picker is a later phase; for now we
 *  render the raw path string read-only so the information is at least visible. */
export function TreePathWidget(props: WidgetProps) {
  return <ReadOnlyWidget {...props} />;
}
