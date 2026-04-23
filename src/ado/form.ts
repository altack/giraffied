import type {
  AdoField,
  AdoFieldDefinition,
  AdoFormControl,
  AdoFormLayout,
} from './types';

/** The set of widgets the modal knows how to render. Keeping this closed keeps
 *  the renderer dispatcher exhaustive — a missing case is a compile error in
 *  Phase C, not a runtime "unknown control type". */
export type WidgetKind =
  | 'html'
  | 'plainText'
  | 'string'
  | 'integer'
  | 'double'
  | 'picklistSingle'
  | 'picklistMulti'
  | 'identity'
  | 'dateTime'
  | 'boolean'
  | 'treePath'
  | 'readOnly';

export interface FormControl {
  referenceName: string;
  displayName: string;
  widget: WidgetKind;
  allowedValues?: string[];
  readOnly: boolean;
  required: boolean;
  helpText?: string;
}

export interface FormGroup {
  label: string;
  controls: FormControl[];
}

export interface FormDescriptor {
  mainGroups: FormGroup[];
  sidebarGroups: FormGroup[];
}

/** Fields the modal renders *structurally* (dedicated widgets outside the generic
 *  form) or never — so we skip them even when they appear on the ADO layout. Keep
 *  this list tight: anything not here that's on the form should render. */
const STRUCTURAL_OR_HIDDEN = new Set<string>([
  // Structural — rendered with bespoke widgets.
  'System.Id',
  'System.Title',
  'System.State',
  'System.AssignedTo',
  'System.CreatedBy',
  'System.CreatedDate',
  'System.Tags',
  'System.Description',
  'System.WorkItemType',
  // Classification — deferred to a future phase (read-only stub).
  'System.AreaPath',
  'System.IterationPath',
  // Bookkeeping metadata the form occasionally surfaces but we don't edit.
  'System.Reason',
  'System.ChangedBy',
  'System.ChangedDate',
  'System.Rev',
  'System.History',
  'System.BoardColumn',
  'System.BoardColumnDone',
  'System.BoardLane',
  'Microsoft.VSTS.Common.StackRank',
  'Microsoft.VSTS.Common.BacklogPriority',
  // Points fields are handled by the dedicated "Story Points" sidebar row (see
  // writePointsFieldFor in workItemVisuals.ts) — a generic number input here
  // would duplicate that and race it on save.
  'Microsoft.VSTS.Scheduling.StoryPoints',
  'Microsoft.VSTS.Scheduling.Effort',
  'Microsoft.VSTS.Scheduling.Size',
  // Time-tracking is its own dedicated row with incremental logging.
  'Microsoft.VSTS.Scheduling.CompletedWork',
]);

/** Known marketplace contribution ids we understand. Many orgs install the
 *  `ms-devlabs` multi-value or single-value picklist extensions to add restricted
 *  pick lists to work-item forms; these show up as `isContribution: true` controls
 *  with the real field reference tucked into `contribution.inputs.FieldName`. */
const MULTIVALUE_CONTRIBUTIONS = [
  'multivalue-form-control',
  'vsts-extensions-multivalue-control',
  'workitem-multivalue-control',
  'multi-value',
];
const SINGLEVALUE_PICKLIST_CONTRIBUTIONS = [
  'wit-picklist-extension',
  'wit-picklist',
  'picklist-control',
];

function isMultiValueContribution(contributionId: string | undefined): boolean {
  if (!contributionId) return false;
  const id = contributionId.toLowerCase();
  return MULTIVALUE_CONTRIBUTIONS.some((marker) => id.includes(marker));
}

function isSingleValuePicklistContribution(contributionId: string | undefined): boolean {
  if (!contributionId) return false;
  const id = contributionId.toLowerCase();
  return SINGLEVALUE_PICKLIST_CONTRIBUTIONS.some((marker) => id.includes(marker));
}

/** Pull the backing field reference out of a form control. Plain FieldControls carry
 *  it on `id` (or `fieldRef`); contribution controls (marketplace extensions) hide
 *  it under `contribution.inputs.FieldName`. Returns null when the control has no
 *  editable backing field — pure-UI widgets like LinksControl, Deployments,
 *  Development, … — so the caller can drop it from the descriptor. */
function resolveFieldRef(c: AdoFormControl): string | null {
  if (c.fieldRef) return c.fieldRef;
  const input = c.contribution?.inputs;
  if (input) {
    const fromInput =
      input['FieldName'] ??
      input['fieldName'] ??
      input['field'] ??
      input['FieldRefName'];
    if (typeof fromInput === 'string' && fromInput) return fromInput;
  }
  // Plain FieldControls: `id` is the field reference. Reject GUID-shaped ids
  // (those belong to contributions whose inputs we couldn't parse).
  if (c.id && !/^[0-9a-f]{8}-/.test(c.id)) return c.id;
  return null;
}

function pickWidget(
  controlType: string | undefined | null,
  field: AdoField | undefined,
  typeField: AdoFieldDefinition | undefined,
  contributionId: string | undefined,
): WidgetKind {
  // Contribution controls first — marketplace picklist extensions win over the
  // raw field type because a string-typed field can still be a multi-value picker
  // when wrapped in a multi-value extension.
  if (isMultiValueContribution(contributionId)) return 'picklistMulti';
  if (isSingleValuePicklistContribution(contributionId)) return 'picklistSingle';

  // Control-type hints take precedence — they reflect what the form designer
  // actually chose as the widget, which can differ from the field's raw type
  // (e.g. a plainText field shown as a single-line FieldControl).
  if (controlType === 'HtmlFieldControl') return 'html';
  if (controlType === 'DateTimeControl') return 'dateTime';
  if (controlType === 'WorkItemClassificationControl') return 'treePath';
  if (controlType === 'IdentityFieldControl' || field?.isIdentity) return 'identity';

  const hasAllowed = (typeField?.allowedValues?.length ?? 0) > 0;

  // Field data-type fallthrough.
  switch (field?.type) {
    case 'html':
      return 'html';
    case 'plainText':
      return 'plainText';
    case 'boolean':
      return 'boolean';
    case 'dateTime':
      return 'dateTime';
    case 'treePath':
      return 'treePath';
    case 'identity':
      return 'identity';
    case 'integer':
    case 'picklistInteger':
      return hasAllowed ? 'picklistSingle' : 'integer';
    case 'double':
    case 'picklistDouble':
      return hasAllowed ? 'picklistSingle' : 'double';
    case 'picklistString':
      return 'picklistSingle';
    case 'string':
      return hasAllowed ? 'picklistSingle' : 'string';
    default:
      return 'string';
  }
}

/** Walk the work-item-type's form layout and produce our render descriptor.
 *  All visible `custom` pages are aggregated — history/links/attachments pages
 *  are replaced by Jirafied's own Activity tabs. Hidden groups/controls and
 *  structural fields (Title, State, Assignee, Description, Tags, points, …) are
 *  filtered out so the descriptor only carries the *extra* fields the team
 *  added. */
export function buildFormDescriptor(
  layout: AdoFormLayout,
  orgFieldsByRef: Map<string, AdoField>,
  typeFieldsByRef: Map<string, AdoFieldDefinition>,
): FormDescriptor {
  const customPages = (layout.pages ?? []).filter(
    (p) => p.pageType === 'custom' && p.visible !== false,
  );
  if (customPages.length === 0) {
    return { mainGroups: [], sidebarGroups: [] };
  }

  const allGroups: FormGroup[] = [];
  for (const page of customPages) {
   for (const section of page.sections ?? []) {
    for (const group of section.groups ?? []) {
      if (group.visible === false) continue;
      const controls: FormControl[] = [];
      for (const c of group.controls ?? []) {
        if (c.visible === false) continue;
        const ref = resolveFieldRef(c);
        if (!ref) continue;
        if (STRUCTURAL_OR_HIDDEN.has(ref)) continue;
        const field = orgFieldsByRef.get(ref);
        const typeField = typeFieldsByRef.get(ref);
        // If the ref doesn't resolve against any known field definition, it's
        // probably a pure-UI control whose "input" was a label or heading. Skip.
        if (!field && !typeField) continue;
        const widget = pickWidget(
          c.controlType,
          field,
          typeField,
          c.contribution?.contributionId,
        );
        controls.push({
          referenceName: ref,
          displayName: c.label?.trim() || field?.name || ref,
          widget,
          allowedValues: typeField?.allowedValues,
          readOnly: !!c.readOnly || !!field?.readOnly,
          required: !!typeField?.alwaysRequired,
          helpText: typeField?.helpText,
        });
      }
      if (controls.length === 0) continue;
      allGroups.push({
        label: group.label?.trim() || '',
        controls,
      });
    }
   }
  }

  // Groups that contain a long/rich widget go to the main area (need the width);
  // everything else slots into the sidebar. Within each bucket we preserve ADO's
  // layout order so teams get the spatial arrangement they configured.
  const mainGroups: FormGroup[] = [];
  const sidebarGroups: FormGroup[] = [];
  for (const g of allGroups) {
    const hasLong = g.controls.some(
      (c) => c.widget === 'html' || c.widget === 'plainText',
    );
    (hasLong ? mainGroups : sidebarGroups).push(g);
  }
  return { mainGroups, sidebarGroups };
}
