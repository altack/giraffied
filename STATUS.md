# Giraffied — Status

Last worked on: **2026-05-04** (Phase 13 — image auth rewrite: cookie path dropped, single source of truth blob cache + DOMParser src rewrite at the data layer)

A Chrome MV3 extension that replaces the Azure DevOps sprint taskboard (`dev.azure.com/.../_sprints/taskboard/`) with a Linear/Sentry-style full-tab app. Reads/writes directly against the ADO REST API from the extension page (no backend). Auth is a PAT paste-in stored in `chrome.storage.local`.

---

## Done

### Phase 1 — Scaffold ✅
- Vite 8 + React 19 + TS 6 + Tailwind 4 + `@crxjs/vite-plugin` (MV3)
- `pnpm build` outputs a loadable unpacked extension in `dist/`
- Toolbar-icon click (handled by the service worker) opens the full-tab app

### Phase 2 — Onboarding ✅
- PAT paste-in + org input + project & team pickers
- Paginated (follows `x-ms-continuationtoken`), sorted alphabetically, searchable
- Settings persisted to `chrome.storage.local` via Zustand `persist`

### Phase 3 — Read-only sprint taskboard ✅
- Current iteration → iteration relations + column config + batch work items composed in `useTaskboard`
- Gracefully handles `{columns:[], isCustomized:false}` by **skipping `/taskboardworkitems`** and synthesising one column per Task state
- 30s foreground polling (`refetchIntervalInBackground: false`) + manual refresh
- TopBar with iteration name + date range + team context

### Polish layered on top of Phase 3 ✅
- Linear/Sentry visual language: Inter Variable, near-black canvas (`#08080a`), hairline borders `rgb(255 255 255 / 0.06)`, `.lit-top` inset highlight utility
- Gradients used **only** on the "Giraffied" wordmark and the primary `Button` variant
- Sticky column header row with `backdrop-blur-lg` (fixed via `h-screen` + `overflow-hidden` on Board so the grid owns the scroll)
- Pill-style column headers, per-track rounded column cells, horizontal swimlane banners
- Collapsible swimlanes (chevron rotates −90°); collapse state **persisted per sprint** in `chrome.storage.local` via `collapsedLanes.store.ts`
- Copy-link hover action on cards and swimlane titles (→ `https://dev.azure.com/{org}/{project}/_workitems/edit/{id}`)
- Real avatars via `<img>` + session cookie — **no extra PAT scope needed**
- Default row sort: Feature → Epic → Story/PBI/Issue → Task → **Bug (bottom)**, alphabetical within tier; cards sort by ADO `order` (StackRank)

### Phase 4 — Drag cards between columns ✅
### Phase 5 — Reorder within column ✅
- `@hello-pangea/dnd` (v18) — picked over `pragmatic-drag-and-drop` for the built-in placeholder + push animation a Linear-style board needs
- **Drag is scoped to a single parent**: each swimlane's droppables share a `type` of `lane-${parentId}` (or `lane-unparented`), which is how hello-pangea enforces "can't drop in another lane" at the library level — no cursor/placeholder shows on foreign lanes
- ColumnCell is a `<Droppable>`, TaskCard wraps in `<Draggable>`; cell gets a subtle indigo tint + border while `isDraggingOver`, card gets a lift shadow + ring while `isDragging`
- Cross-column drop → `PATCH /wit/workitems/{id}` to set `System.State` from `column.mappings[workItemType]`, then `PATCH /work/iterations/{id}/workitemsorder` to set order
- Same-column reorder → reorder call only
- Subtasks within a column are **not** sorted client-side — render is array-order, and drag splices the card to its new index. ADO's reorder-response `order` values are deliberately discarded on success: the response only covers a subset of siblings, and mixing fresh + stale orders causes a visible revert snap. On error we `invalidateQueries`; otherwise the next 30s refetch pulls the authoritative post-PATCH order from ADO.
- **Drop-flicker fix**: a local `useState` overlay shadows `data` during the drop animation window. `onDragEnd` calls `flushSync(() => setOverlay(next))` so React's reconciler commits synchronously before hello-pangea/dnd's FLIP animation reads layout. `queryClient.setQueryData` alone is not enough — its observer notifications route through `useSyncExternalStore`, which isn't flushable from an event handler, so by the time React commits the cache update the library has already measured the old DOM and animated back to source. The cache is still `setQueryData`'d in parallel so refetches can't clobber the optimistic state; on mutation settle we drop the overlay and the cache takes over. Belt-and-suspenders: TaskCard sets `transitionDuration: 0.001s` while `isDropAnimating` per the hello-pangea drop-animation guide.
- `parentId` = parent work-item id for regular lanes, `0` for "Everything else"; `previousId=0` / `nextId=0` pin to top/bottom

### Phase 6 — Quick-edit modal ✅
- Click card → draggable floating panel (centered on open, grab header to move anywhere, Esc to close). Non-modal by design — no backdrop, so the board stays fully interactive while the panel is open. Rendered via `createPortal` to `document.body` and clamped to viewport on resize.
- Form body is Jira-shaped: Title (inline edit) · Status / Assignee / Points row · Description · Time tracking · History.
- **Description** uses Basecamp's **Trix** web component (`trix` package, ~50kb gz) wrapped in a minimal React adapter (`DescriptionEditor.tsx`). Editor is HTML in/out, matching ADO's `System.Description` storage; file attachments are blocked via `trix-file-accept` preventDefault. Toolbar + content are re-themed to match the pearled dark aesthetic (overrides in `globals.css` under `.jfd-trix`).
- **Assignee picker**: default list is **unique assignees currently on the board** (computed once in `BoardGrid` from swimlane rows + children + unparented, alphabetical, "Unassigned" pinned on top). Typing widens the search to the full `teams/{id}/members` list, deduped by uniqueName/id. The raw team-members endpoint is too noisy to show by default (retired/unrelated accounts).
- **Time tracking**: separate quick-log affordance that PATCHes `Microsoft.VSTS.Scheduling.CompletedWork = current + delta`. Independent mutation from the main Save — user can log hours without touching the other fields. Negative values allowed for corrections.
- **History**: reverse-chronological list from `GET /wit/workitems/{id}/updates`. Filters out noisy synthetic fields (`System.Rev`, `ChangedDate`, `BoardColumn`, `StackRank`, etc). Each event rendered with avatar + human-shaped summary ("Alice changed status To Do → In Progress · 2h ago"). Capped at 40 entries.
- Single Save → one `PATCH /wit/workitems/{id}` with a JSON-Patch body of **only the changed fields** (`patchWorkItemFields`). Rollback via `onError` restoring the snapshot taken in `onMutate`.
- Optimistic cache update mutates `TaskboardData` directly: fields on the work item, and — when State changed — the card's `taskboard.columnId/column/state` so it visually moves to the new column.
- Drag vs click: hello-pangea/dnd lets a clean pointerdown-up through as a click when there's no drag movement, so `onClick` on the draggable `<article>` is enough. The CopyLinkButton is wrapped in `data-no-open` to keep it from double-triggering.

### Phase 6 polish pass ✅
- Primary `Button` variant no longer uses the indigo→violet gradient ("AI slop"). New default is pearled/glass: `bg-white/[0.09] backdrop-blur-xl border border-white/[0.14]` with a subtle inset highlight. The wordmark's gradient is the only remaining gradient in the app.
- Modal dropped Remaining Work and Tags fields (not needed in v1).
- `DEFAULT_WORKITEM_FIELDS` extended with `System.Description`, `System.Rev`, `Microsoft.VSTS.Scheduling.CompletedWork`.
- New endpoint `listWorkItemUpdates(projectId, id)` wrapping `GET /_apis/wit/workitems/{id}/updates`.

### Phase 6 v2 — Jira-shaped modal with real Comments ✅
Shell is now **fixed height** (no more jumping when tabs switch or content grows) with a **two-column layout**: main area + 280px right sidebar, each with independent scroll. Both stay visible at all times, footer (Cancel / Save) is pinned.

- **Sidebar** (editable fields, always reachable): Status · Assignee · Story Points · **Tags** (re-introduced — chip input, ×/Backspace/Enter/`;`/`,` behavior) · Time tracking.
- **Main** (title + description + activity tabs).
- **Activity tabs** (segmented control, `Tabs` primitive): **Comments** · **Work Log** · **History**.
- **Comments** (`CommentsPanel.tsx`) — real ADO comments via `/wit/workItems/{id}/comments` (`7.1-preview.4`, `format=html` on POST, no format param on PATCH since some orgs 400 on it). Flat thread under the composer, newest first. Each row: avatar · author · relative time · "edited" indicator · hover-reveal actions. **Edit / Delete on own comments** only. Own-comment detection (`isOwnComment`) tries `authenticatedUser.id === createdBy.id` first, falls back to `mailAddress ↔ uniqueName` — needed because ADO emits different id flavors for /connectionData vs /comments across orgs. List response normalizes `id` → `commentId` (ADO Services returns the id under `id` in some tenants despite the docs showing `commentId`). Composer + in-place edit both use the **minimal** Trix variant.
- **Work Log** (`WorkLogPanel.tsx`) — reconstructed from `/updates` filtered to `CompletedWork` diffs. "By person" card with proportional bars + per-entry timeline with `+/-Nh` running totals. Logging time from the sidebar invalidates the updates query so this tab refreshes in place.
- **History** — extracted to `HistoryPanel.tsx`, same logic as before.

**Editor UX**
- `DescriptionEditor` grew a `variant` prop: `default` (form field — always shows toolbar), `plain` (description — no border, looks like prose until you click it, toolbar appears on focus), `minimal` (comment composer / in-place edit — has border, toolbar hidden until focus).
- **Per-editor sticky toolbar**: once *this* editor has been focused, its toolbar stays visible for the rest of its lifetime. Prevents the blur→collapse→click-race bug where Send/Save jumped up as the user clicked it. Each editor's `unlocked` is local — other editors stay collapsed, and the `WorkItemModal` is keyed on `task.workItem.id` so a task switch mounts a clean tree.
- New `autoFocus` prop — fires after `trix-initialize`, places cursor at end, flips the toolbar open. Used by the in-place comment editor so Edit is one click, not two.
- **Initial-load fix**: `emittedHtml.current` now starts as `''` (not the initial `value`), so the first pass always calls `editor.loadHTML(value)` instead of relying on Trix's hidden-input auto-load. The auto-load was occasionally leaving HTML unparsed (description rendered as literal text).
- Trix CSS overrides under `.jfd-trix` match the dark pearled aesthetic; new variant selectors `.jfd-trix--plain`, `.jfd-trix--minimal`, and `.jfd-trix--open` (the sticky state).

**Swimlane banners**
- Clicking a banner now opens the parent work item in the modal; the chevron is its own `<button>` that stops propagation and toggles collapse. `selectedTask` resolution also looks up `lane.row`, `applyDraftToTaskboard` patches `lane.row` for optimistic updates. (Status dropdown shows current state only when the column config doesn't map the parent type — full work-item-type state fetch is a later polish pass.)

**Plumbing**
- New endpoints: `listWorkItemComments`, `createWorkItemComment`, `updateWorkItemComment`, `deleteWorkItemComment`, `getConnectionData`.
- New hooks: `useComments`, `useCurrentUser`.
- New types: `AdoWorkItemComment`, `AdoCommentList`, `AdoConnectionData`.
- **JSON-Patch semantics fix**: `patchWorkItemFields` now emits `op: "remove"` (no value) when the field value is `null` or `''`, instead of `op: "add"` with empty value. ADO silently no-ops `System.Tags = ""` via `add`; only `remove` actually clears it. Same path reliably clears `System.AssignedTo`, `StoryPoints`, description, etc.
- **Nested-form bug** fixed — the comment composer was a `<form>` inside the outer `workitem-form`. Browsers handle nested React-rendered forms inconsistently; clicking Send was submitting the wrong one and reloading the page. Composer is now a `<div>` + plain button.

**Draggable modal**
- `maxHeightVh` → `heightVh` + `fixedHeight` prop. When fixed, uses `height: Xvh` (not `max-height`) so the dialog is exactly that tall regardless of content. Body container is `min-h-0 overflow-hidden` so children own their scroll.

### Phase 7 — Assignee filter ✅
Top-right facepile + popover picker. "Mine / tag / parent-story chips" from the original plan collapsed down to a single assignee filter — covered the 90% case without the chip-bar complexity. Tag / parent filters can layer on later if needed.

- **Trigger** lives at the right end of `TopBar`. Idle: `Users` icon + overlapping facepile of the top-4 most-loaded assignees (hairline `ring-1 ring-[var(--color-canvas)]` separators) + a `+N` counter. Active: the facepile collapses into a single indigo chip `[avatar] Name · count ×`. Click the chip to re-open the picker; click `×` to clear. No inline layout shift when switching between states.
- **Popover** (`AssigneeFilter.tsx`) is portal'd, 260px, right-aligned to the trigger, with a calm `jfd-popover-enter` keyframe (140ms opacity+scale+lift). Search input auto-focused; rows show avatar · name · card count · ✓ when selected; arrow-key highlight + Enter picks; Esc / outside-click closes. Count-sorted desc, tiebreak alphabetical.
- **Filter application** is view-only in `BoardGrid` via a `useMemo` projection: a lane is kept when the parent matches OR any child matches; subtasks only kept when they match; unparented filtered directly. The selected task for the modal resolves against the *unfiltered* base so opening a card and then toggling the filter doesn't close the dialog.
- **Drag is disabled while filtered** (`Droppable.isDropDisabled` + `Draggable.isDragDisabled` threaded via a `dragDisabled` prop). `destination.index` would be relative to the filtered subset and wouldn't splice cleanly into the reorder call. Cursor switches from `cursor-grab` to `cursor-pointer` so the affordance doesn't lie.
- **Auto-expand matching lanes** on filter activation, not on every refetch. New store method `expandLanes(contextKey, laneKeys)` removes only the named keys from the collapsed set (cleaning up empty entries) rather than wiping the whole context like `expandAll` does. Guarded by a `useRef` so the 30s poll doesn't fight a user who manually re-collapses a lane while the filter is still on. Unrelated lanes keep their user-set collapse state. No restore on clear — the user said not to.
- **Self-clearing** — if the selected assignee disappears from the board (reassignment, refetch), the filter silently drops to avoid a "stuck empty" view.
- **Data shape** — `assigneesOnBoard(data)` returns `BoardAssignee[]` (`{key, identity, count}`) sorted count-desc. The modal's assignee picker still gets a plain alphabetical `AdoIdentity[]` (derived from the counted shape in Board) so that picker's default ordering is unchanged.

### Inline link actions ✅ (piggy-backed on Phase 7)
- `CopyLinkButton` moved out of the task card's absolute top-right into an inline action group beside the title (revealed on hover / focus-within). Dropped the old `pr-5` title gutter.
- New sibling `OpenLinkButton.tsx` — `ExternalLink` icon, opens the item in the native ADO UI via `window.open(url, '_blank', 'noopener,noreferrer')`. Shares `workItemUrl()` from `CopyLinkButton.tsx` so the two actions can't drift.
- Same pair appears on subcards (`TaskCard`), parent swimlane banners (`SwimlaneHeader`), and in the modal title bar (moved out of `DraggableModal`'s `headerActions` slot and into the title node so the icons sit next to the type/id row). Both handlers `stopPropagation` + `preventDefault` so a click doesn't open the card, toggle the lane, or start a header drag.

### Phase 8 — Create-task dialog ✅
Originally planned as an inline "+ New task" row under every swimlane (Linear-style). Went with a dialog instead — richer input surface, one affordance instead of N per board, and the user wanted description + parent override available from the start. Inline row can still layer on later if rapid-typing-without-dialog becomes a felt need.

- **Trigger**: `+` icon in the same hover-reveal cluster as copy/open on each `SwimlaneBanner` and `UnparentedBanner` (`CreateTaskButton.tsx`). First attempt placed it right-aligned/always-visible; the user asked for it clustered with the other lane actions and hover-only, which is what shipped.
- **Dialog** (`CreateTaskDialog.tsx`): slim `DraggableModal`, 520×80vh max. Parent picker (searchable, full-width popover) · Assignee picker · Title input · plain-variant `DescriptionEditor` for optional description.
- **ParentPicker** (`ParentPicker.tsx`): portal'd searchable dropdown whose popover width matches the trigger's `rect.width` (vs the `AssigneePicker`'s fixed 288px), so the field and its dropdown read as one element. "No parent (Everything else)" pinned on top. Search matches on title + type + `#id`. Only lists parents currently in the sprint (swimlane rows).
- **AssigneePicker** extracted out of `WorkItemModal.tsx` into its own file (`AssigneePicker.tsx`) so both dialogs share one implementation. Behavior unchanged.
- **Keyboard**: Enter in title saves + closes; **Cmd/Ctrl+Enter saves + resets title/description** while keeping parent + assignee — rapid-entry path for adding 5+ sibling tasks to the same Story. Esc cancels. Footer shows the shortcut hint.
- **ADO side**: new `createWorkItem(projectId, type, fields, parentUrl?)` endpoint emits JSON-Patch `add` ops for fields plus a `/relations/-` op with `System.LinkTypes.Hierarchy-Reverse` when a parent is selected. Parent URL is taken from the parent's own `url` field (returned by any prior work-item fetch), so we don't have to reconstruct `https://dev.azure.com/{org}/_apis/wit/workItems/{id}`.
- **Area path**: copied from the parent's `System.AreaPath` when a parent is selected; for "No parent", falls back to the team's default via a new `getTeamFieldValues` endpoint, cached in react-query for 1h so repeat "create another"s don't re-hit ADO.
- **State is deliberately not sent** — ADO applies the team's default new-item state. Setting it explicitly would mean guessing the initial-state mapping per team and would break anyone with custom workflows. On success, `appendCreatedTask` picks the column whose `mappings.Task` matches the returned state (falling back to column 0 if nothing matches — rare, and the 30s poll will correct it).
- **Cache**: `queryClient.setQueryData` grafts the new task into the right lane (or `unparented` when no parent). No `invalidateQueries` — matches the drag-reorder pattern, lets the 30s poll reconcile authoritative order later.
- **Filter interaction**: the dialog's swimlane list comes from the un-filtered `baseData.swimlanes`, so picking a parent isn't constrained by an active assignee filter. New tasks that don't match the filter land in `baseData` correctly and simply aren't visible in the filtered view until the filter is cleared.

### Empty-parent-lane fix ✅ (unrelated to Phase 8)
`useTaskboard` was building `rowIdSet` only from children's parents, so a Bug/Story/Feature freshly added to the sprint with no Task children yet was invisible — nothing referenced it as a parent. Now we also walk the iteration's root relations (`source:null`) and add any root work item that isn't itself a card (not in `cardsById`) as a swimlane row. Teams using "Bugs as tasks" config are unaffected: those Bugs are cards, already in `cardsById`, so they flow through the existing `unparented` path. Empty lanes now match native ADO and pair naturally with the new `+` button — perfect entry point for adding the first Task to a brand-new Bug.

### Phase 9 — Data-driven work-item modal ✅
Extra fields in the quick-edit modal are now **discovered from the team's ADO form layout** instead of hardcoded. Open a Bug and you see Repro Steps, System Info, Acceptance Criteria, RCA Description, Priority, Severity, Environment (multi-value chip picker), Bug/Hotfix, Components, Root Cause (RCA), Security relevant (checkbox), CVSS score, Affected asset, Found-in / Integrated-in Build — because that's what the team put on their Bug form. Open a Task and you see whatever that team configured for Tasks. No per-field code to maintain; no display-name matching against a guessed reference name list.

**Discovery (three endpoints, cached forever):**
- `GET /_apis/work/processes?$expand=projects` — find the inherited process whose `projects` list contains our project id. This is the authoritative source; the older `System.CurrentProcessTemplateId` project property sometimes returns a stale/classic template id that `/_apis/work/processes/{id}` doesn't know about. `useProcessId` prefers the listing, falls back to `getProjectCapabilities.templateTypeId`, and throws "classic process" if neither works.
- `GET /_apis/wit/fields` — the org-level field registry (2k+ fields for typical orgs). Gives us the `type` + `isIdentity` + `isPicklist` flags for every field on the form.
- `GET /_apis/work/processes/{processId}/workItemTypes/{ref}/layout` — pages → sections → groups → controls. Resolves the WIT reference name via `getWorkItemType(projectId, displayName)` first since the display name is all the modal has.

**`buildFormDescriptor(layout, orgFields, typeFields)` (in `src/ado/form.ts`):** aggregates every `pageType: "custom"` visible page, iterates groups → controls, and for each resolvable field produces a `FormControl { referenceName, displayName, widget, allowedValues, readOnly, required, helpText }`. Widget kind is picked from `controlType` first (HtmlFieldControl, DateTimeControl, IdentityFieldControl, WorkItemClassificationControl), then the field's data-type (html/plainText/boolean/integer/double/string/picklistString), with contribution controls detected via `contribution.contributionId` substring match (marketplace picklist extensions — single and multi-value). Structural fields handled by the modal's dedicated widgets (Title, State, AssignedTo, Tags, Description, Created-by, story-point aliases) are skipped so they don't double-up. Groups with any html/plainText control go to `mainGroups` (wide rich editors); everything else to `sidebarGroups`. Pure-UI controls with no backing field — `DeploymentsControl`, `LinksControl`, anonymous heading labels — are dropped.

**Widget library (`src/app/board/widgets/`):** one widget per kind with a shared `{ control, value, onChange, disabled }` props signature. `StringWidget` (Input), `NumberWidget` (held as string in draft so "1." mid-typing survives), `HtmlWidget` (wraps `DescriptionField`), `PlainTextWidget` (textarea), `PicklistSingleWidget` (wraps `PicklistPicker`), `PicklistMultiWidget` (wraps `MultiPicklistPicker`), `IdentityWidget` (wraps `AssigneePicker` with empty board-assignees so search falls straight to team roster), `DateTimeWidget` (native datetime-local with `[color-scheme:dark]`), `BooleanWidget` (checkbox), `ReadOnlyWidget` (label + formatted value, handles arrays + identities), `TreePathWidget` (ReadOnly stub for v1). `FieldRow` is the dispatcher; renders label + required asterisk + help-text tooltip, then switches on `control.widget`. `readOnly` controls always render through `ReadOnlyWidget` regardless of widget kind.

**Generic draft + patch (`src/app/board/form-state.ts`):**
- `buildInitialDraft(controls, workItemFields)` → `Record<ref, DraftValue>` — hydrates per widget, so picklistMulti holds `string[]`, boolean holds `bool`, identity holds the `AdoIdentity` object, numbers held as string for editability.
- `diffDraft(controls, original, draft)` → `AdoFieldPatch[]` — per-widget equality rules (identity by uniqueName, multi-picklist by joined `"a; b"`, numbers by string comparison) and per-widget wire conversion (multi-picklist joins with `; `, identity sends uniqueName, empty strings round-trip to null via the existing JSON-Patch `remove` op in `patchWorkItemFields`).
- `validateDraft(controls, draft)` — checks `alwaysRequired` flag, returns the first violation. Booleans are considered always-set.

**Modal refactor:** `WorkItemModal.tsx` now keeps a narrow structural `Draft` (title, state, assignee, storyPoints, tags, description) and a parallel `layoutDraft: DraftRecord` for everything discovered. The structural draft resets on modal open; the layout draft hydrates once per `task.workItem.id` via a `useRef`-guarded effect so a slow fetch arriving after the user has edited a layout field doesn't clobber those edits. Save concatenates `buildPatches(structural)` + `diffDraft(layout)` into a single `PATCH /wit/workitems/{id}` — one network call regardless of how many fields changed. Optimistic cache writes the structural fields through `applyDraftToTaskboard` and every layout patch through the full-workitem cache so close/reopen shows the edited value before the refetch lands.

**Group-header dedup:** single-control groups (Repro Steps, System Info, Acceptance Criteria, RCA Description) suppress their group header — the field label already carries the same name, so the native ADO UI renders them without a section heading and we match that. Multi-control groups (Details, Build, Security issues) keep their header.

**Fallbacks:** classic Agile/Scrum/CMMI projects (no `/work/processes` entry) throw clean from `useProcessId` and the sidebar shows "Couldn't load form layout. Core fields still editable." — structural fields stay fully usable. Loading state shows skeleton blocks in both main and sidebar.

**Deleted:** the hardcoded `BUG_FIELD_DISPLAY_NAMES` + `BugFieldMap` + `BugCustomFields` machinery from Phase 6.5. Environment/Components/BugHotfix/RCA/RCA Description all now appear because ADO says they do, not because we hardcoded their display names. If a team adds a new field to their form, it appears in the modal on the next reload — no code change required.

**Out of scope for v1:** Area/Iteration tree pickers (rendered read-only via `TreePathWidget` stub), attachments, conditional-visibility field rules.

### Phase 10 — Pinned sidebar + Status picker ✅
Phase 9 put every form-layout field in the sidebar, which was chaotic on Bugs (13+ rows). Phase 10 reorganizes the sidebar into three zones so the default view stays quiet and the user can opt-in to seeing more.

**Zones (top → bottom):**
- **Core** (locked): Status · Assignee · Created by · Story Points · Tags · Time tracking. Never takes a pin icon — these are work-item-level essentials, always visible.
- **Pinned**: layout fields the user has pinned, plus per-type defaults. For **Bug** we default-pin **Severity · Environment · Bug/Hotfix**. Each row reveals a `PinOff` icon on hover.
- **MORE FIELDS (N)** collapsible, **closed by default**. Expands to show the rest of the layout fields, preserving ADO's group structure (Details, Build, Security issues, …). Each row reveals a `Pin` icon on hover; clicking it promotes the field into the Pinned zone.

Hairline dividers (`border-white/[0.06]` full-width via `-mx-4`) separate the zones. Pin buttons are 20×20, `opacity-0 group-hover:opacity-100` — invisible until aimed at.

**Default-pin resolution** (`src/app/board/default-pins.ts`): per-WIT map of display names resolved by case-insensitive match against the current descriptor's sidebar controls. The matcher also accepts `endsWith ' target'` or `endsWith '/target'` so "Digital Platforms Environment" still resolves against "Environment" and "Bug/Hotfix" matches regardless of prefix. No ADO reference names are hardcoded — portable across process templates.

**Pin state** (`src/state/pinnedFields.store.ts`): Zustand + persist, keyed per work-item type, with `{ added: string[], hidden: string[] }` per type. Effective pins = `(defaults ∪ added) \ hidden`, so a user can unpin a default (e.g. if their team doesn't care about Severity) and the choice survives across sessions. Persistence goes through the existing `chromeLocalStorage` adapter → `chrome.storage.local`.

**Status picker upgrade:** the previous raw `<select>` showed only states the team had *mapped* to taskboard columns — which omits valid states like "New" or "Approved" on many boards. Replaced with the same `PicklistPicker` that every other sidebar dropdown uses (search, 2-line-clamp, tooltip), fed by a new `useWorkItemStates` hook that reads the full non-Removed state list from `getWorkItemType(projectId, typeName)`. Falls back to the column-derived list if the state fetch errors, so the dropdown never empties. `PicklistPicker` also grew a `clearable` prop — off for Status (state is never empty), on by default.

**FieldRow action slot:** the label row of the generic `FieldRow` now accepts a trailing `action` node, right-aligned via `ml-auto`. The sidebar renderer wraps each pinnable row in `group` so the pin button can hover-reveal with `opacity-0 group-hover:opacity-100`.

### Phase 11 — Bug-fix sprint (2026-05-04) ✅
A focused round of fixes responding to user-reported issues. Each was small individually; together they touch most of the modal surface.

- **Sprint-scoped time tracking.** `OverallTracking`, `WorkLogPanel`, `TimeContributors` now subscribe to `useCurrentIteration()` and skip any `revisedDate < iteration.attributes.startDate` when summing CompletedWork deltas. Carryover hours from a prior sprint no longer pollute the "By person" totals or the OverallTracking header. The `WorkLogPanel` running-total column resets at sprint start (was previously showing the field's all-time CompletedWork). Dropped `OverallTracking`'s "fast total" — it summed each card's *current* CompletedWork (all-time per card) which contradicted the sprint-scoped breakdown the popover renders. New "carryover only" empty state when every card's hours predate the sprint.
- **Live identity search in `AssigneePicker`.** Picker pool now goes board → team (`useTeamMembers`) → project (`useProjectMembers`, lazy on first search, fans out to every team in the project + caches 10 min) → org IdentityPicker (best-effort; standard `vso.work_write` PATs 401 here, the hook swallows it silently and lets the project-wide layer carry the load). The IdentityPicker stays in the chain so PATs with broader scope light up extra results without code change. Email/UPN typing fallback was tried and removed — judged overkill for a normal flow.
- **Light-mode active assignee filter visibility.** `text-indigo-100` on a translucent indigo wash was invisible on white. Added `theme-light:` overrides on the active chip + selected-row highlight so the activated state reads in both themes.
- **Tag save reliability.** `TagsEditor` now exposes a `flush()` imperative handle via `useImperativeHandle`. The modal's `handleSubmit` calls `tagsRef.current?.flush()` first, folds any pending input into an `effectiveDraft`, and uses *that* for both `buildPatches` and the optimistic snapshot. Closes the bug where clicking Save with a half-typed tag silently dropped the tag (blur committed via setDraft → React scheduled the update → submit handler read draft from a stale closure before the update propagated).
- **Image/video render reliability via PAT-fetched blobs.** `<img>`/`<video>` elements were 302→sign-in→500-ing whenever the user's `dev.azure.com` cookie was stale. New `fetchAuthedBlob(url)` in `client.ts` (with `credentials: 'omit'` — load-bearing; cookies were short-circuiting ADO's auth eval before it ever looked at the PAT header) + a module-level cache in `src/app/board/adoImageAuth.ts`. Cookie-failure recovery shipped as a patch-stack of `useLayoutEffect` pre-empt + capture-phase error listener + `cookieAuthKnownBroken` flag — replaced wholesale in Phase 13.
- **Modal stability — fixes the every-30s flash + scroll jump.** `WorkItemModal` was recomputing `original = useMemo(() => toDraft(task), [task])` on every taskboard poll (poll lands → `task` reference changes → `original` recomputes → useEffect fires `setDraft(original)` → `draft.description` reference flips → `DescriptionField`'s `value` prop changes → Tiptap setContent re-parses → `<img>` nodeViews destroyed and recreated → image flash + DOM reflow shifts the scroll). Snapshot fix: `original` is now `useState(() => toDraft(task))` (lazy init, captured once at mount), and the auto-resync useEffect was removed. The modal is keyed on `workItem.id` at the BoardGrid call site, so opening a different task remounts and re-snapshots through the lazy initializer; we don't need a runtime sync. Save invalidates + closes the modal, so on reopen the user sees fresh data — no UX regression from giving up the live-resync.

### Phase 13 — Image auth rewrite (cookie path dropped) ✅
Replaces the Phase 11 patch-stack — `cookieAuthKnownBroken` flag + `useLayoutEffect` pre-empt sweep + capture-phase error listener + fallback chains — with a single source of truth: ADO attachments **always** go through the PAT-fetched blob cache. The cookie path was someone else's session that we couldn't refresh from the extension; PAT is the only auth that's ours.

- **`adoImageAuth.ts` slimmed** to its essentials: `Map<originalUrl, blobUrl>` cache + `inflight` dedupe + `fetchAndCacheBlob(url)` + `getCachedBlobUrl(url)`. Dropped `cookieAuthKnownBroken` / `markCookieAuthBroken` / `isCookieAuthKnownBroken` — the renderer/nodeView no longer ask "is the cookie broken?", they just ask the cache. ~50 lines vs the previous ~75.
- **New `useAdoAttachments(html)` hook** (`src/app/board/useAdoAttachments.ts`). Scans the HTML once for absolute ADO attachment URLs, kicks off parallel `fetchAndCacheBlob` calls for any not already cached, returns a `{ resolved: Map<url, blobUrl>, ready: boolean }` shape. `resolved` is a stable Map reference across renders that don't change the resolved set — keeps downstream `useMemo` (the renderer's `preprocessHtml`) from rebuilding for no reason and re-injecting via `dangerouslySetInnerHTML` (which is what produced the every-render flash before).
- **`RichTextRenderer` rewrites src at the data layer.** `preprocessHtml(html, resolved)` parses the HTML with `DOMParser`, replaces each ADO attachment src with its cached blob URL (or strips the src + tags the element with `data-jfd-attachment-pending` while the fetch is in flight), and also handles the `<a href="…mp4|webm|mov|ogv|m4v">` → `<video controls>` upgrade in the same pass. Dropped the post-mount `useLayoutEffect` sweep, the capture-phase `error` listener, and the fallback-to-original-on-failure path. The cache says yes or no.
- **Tiptap `DeletableImage` nodeView reads the cache during construction.** If the URL is in the cache, set src to the blob URL synchronously. If not, leave src empty and apply the blob URL when the fetch lands. No error listener, no `cookieAuthKnownBroken` check, no fallback. `getHTML()` reads from the editor's internal node state (not the DOM), so saved HTML still carries the original ADO URL — the blob is purely a display detail.
- **Placeholder while in flight.** New `[data-jfd-attachment-pending]` style in `globals.css` — soft pulsing dashed outline at minimum 80×60px. Stripping the src plus the placeholder rule means no broken-image icon flash on first render; the cache means no flash on subsequent renders.
- **Only failure mode after this is "PAT itself doesn't work"** — same failure mode every other API call already has, surfaced through the existing toaster / read-only banner UX. Phase 12 (Entra OAuth) is independent — when it lands the only change to image auth is `Authorization: Bearer …` instead of `Basic …` in `fetchAuthedBlob`.

**Out of scope:** eviction / TTL on the blob cache (blob URLs are cheap, page lifetime is bounded; revisit if memory becomes an issue). Eager warmup before modal open (most cards don't have inline images).

---

## Remaining

### Phase 11 — Cross-project editing from omnibar search (nice-to-have)
- Org-scope search can return items in any project the user can see, but every
  write path in `WorkItemModal` (PATCH fields, comments, attachments, status)
  uses `useSettings.projectId` in the URL — which is the *current board's*
  project, not the item's. So cross-project items open in read-only mode
  today (banner + all inputs disabled) and the user has to hop to ADO to
  edit.
- To lift this, plumb a per-item `projectId` override through every ADO call
  in the modal (and `useWorkItemFull`, `useComments`, `uploadAttachment`,
  `patchWorkItemFields` — basically everything). Not a lot of code, but
  touches every endpoint call inside the modal. Worth doing if org search
  gets real use; skippable if 99% of searches stay within the current
  project.

### Phase 7.5 — Additional filters (nice-to-have)
- Tag and parent-story chips alongside the assignee filter if users ask for them — the current single-chip assignee filter already covers the 90% case.

### Phase 8.5 — Inline create-task row (nice-to-have)
- Superseded by the dialog for most flows, but a true inline row (focus in place, Enter submits, cursor stays on the next line) could still beat the dialog for "I'm typing 10 tasks back-to-back and never need the description field". Revisit if the dialog's Cmd+Enter repeat-entry proves too heavy for that use case.

### Phase 12 — Real auth: Entra ID OAuth (replaces stored PAT)
The PAT-paste model is the loudest wart left: the token sits in
`chrome.storage.local` in plaintext, scope is over-broad ("Work Items: Read
& write" covers writes a viewer wouldn't need), expirations are silent, and
rotation is manual. Replace with Microsoft Entra ID OAuth via Chrome's
identity API + PKCE.

**Approach** — `chrome.identity.launchWebAuthFlow` opens a system browser
window for the consent prompt, returns the auth code on the standard
`https://<extension-id>.chromiumapp.org/` redirect URI Chrome reserves. We
exchange via PKCE (no client secret required, so the multi-tenant Entra app
ships with the public extension). Scope: `499b84ac-1321-427f-aa17-267ca6975798/.default`
(Azure DevOps). Send `Authorization: Bearer <accessToken>` instead of Basic.
Refresh tokens auto-rotate; access tokens are 1h-lived so the blast radius
is much smaller than a long-lived PAT.

**Implementation steps**:
1. Register a multi-tenant Entra app under our publisher tenant (one-time,
   no per-user setup). Reply URI = `https://<extension-id>.chromiumapp.org/`.
   Note the `client_id`; commit it (it's not a secret in PKCE).
2. Refactor `client.ts` so `Authorization` is computed by an
   `AuthProvider` interface: `getAuthHeader(): Promise<string>` plus
   `onUnauthorized(): Promise<boolean>` for refresh-on-401. Two impls:
   `BearerAuthProvider` (Entra) and `PatAuthProvider` (current behavior,
   kept as fallback).
3. New `state/auth.store.ts` with `mode: 'oauth' | 'pat'`, access/refresh
   token + expiry for oauth mode, current PAT for pat mode. Migrate
   existing PAT-only `settings.store` users by copying `pat` → auth store
   and leaving the settings store storing org/project/team only.
4. Onboarding wizard step 1 becomes "Sign in with Microsoft" (primary
   pearled button) + "Use a Personal Access Token" (secondary). Sign-in
   path drives `chrome.identity.launchWebAuthFlow`, exchanges the code
   via fetch to `login.microsoftonline.com/common/oauth2/v2.0/token` with
   PKCE verifier, persists the tokens.
5. `BearerAuthProvider.getAuthHeader()` returns cached access token if
   `expiresAt > now + 60s`, otherwise hits the refresh endpoint and
   updates the store before returning the new token. Wrap `adoRaw` so a
   401 response triggers one refresh + retry before surfacing the error.
6. Settings menu: "Signed in as <upn>" + "Sign out / re-link" + (for PAT
   mode users) "Rotate PAT". Already part of Phase 9 polish — fold this in.

**Trade-offs**:
- Doesn't work for the small set of orgs still on legacy MSA-only auth
  without an Entra tenant — keep the PAT path as a fallback for them.
- `chrome.identity.launchWebAuthFlow` requires `"identity"` permission in
  the manifest; that's a single-line addition.
- Refresh tokens still live in `chrome.storage.local` — same trust
  boundary as the PAT, but tokens are short-lived and revocable.

Estimated scope: ~1 day end-to-end. Most of it is the Entra app
registration ceremony + onboarding UX; `client.ts` is already a single
seam, so the code change is small.

**Out of scope for this phase**:
- Device-code flow (UX is "copy this code into another tab" — bad fit
  for a polished extension).
- Service-worker cookie proxy (CORS doesn't allow extension-origin
  credentialed cross-origin requests; workarounds break per Chrome update).
- WebAuthn-wrapped PAT (high-friction gesture per session for a tool
  opened many times a day).

### Phase 9 — Polish
- Keyboard nav (j/k/x/c)
- Settings page (team switch, clear cache, sign-out for OAuth / rotate-PAT for PAT mode — Phase 12 dependency)
- Full pass on empty/error states
- Package + submit to Web Store once usable

---

## Known limitations & decisions

- **ADO Services only** (`dev.azure.com`). Server/on-prem explicitly out of scope.
- **PAT-only auth.** OAuth is out of scope for v1; the `ado/client.ts` wrapper is structured to accept another auth impl later.
- **Polling-only realtime** — ADO doesn't expose SignalR/push, and webhooks would need a backend.
- **Avatars require a live dev.azure.com session cookie** in the same Chrome profile (we use `<img src>` which piggy-backs the cookie, no `vso.graph`/`vso.profile` scope demanded).
- **No automated tests.** Manual verification against a live ADO org. Add Playwright + recorded fixture in v1.1 after Phase 9.

---

## Conventions

- Commits: `feat|fix|style|chore|perf: short summary` + body paragraph + Co-Authored-By.
- Branch: `main`. Don't force-push. Don't skip hooks / bypass signing.
- `.claude/settings.local.json` is gitignored.
- After each build, close the old Giraffied tab and open a fresh one — old tabs run stale bundles.

See `CLAUDE.md` for durable project context + ADO gotchas.
