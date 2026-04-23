import type { AdoIdentity } from '@/ado/types';
import type { FormControl } from '@/ado/form';

/** All the raw value shapes a `FormControl` can hold. Using a single discriminated
 *  type lets us key the generic draft (`Record<referenceName, DraftValue>`) on it
 *  without widget-specific casts leaking out of the dispatcher. */
export type DraftValue =
  | string
  | number
  | string[]
  | boolean
  | AdoIdentity
  | null;

export interface WidgetProps<T extends DraftValue = DraftValue> {
  control: FormControl;
  value: T;
  onChange: (next: T) => void;
  disabled?: boolean;
}
