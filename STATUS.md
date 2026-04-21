# Jirafied — Status

Last worked on: **2026-04-21** (Phase 6 shell reworked + ADO Comments)

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
- Gradients used **only** on the "Jirafied" wordmark and the primary `Button` variant
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

---

## Remaining

### Phase 7 — Filters
- Mine / tag / parent-story chips (client-side filter over cached work items)
- Linear-style keyboard-accessible chips

### Phase 8 — Inline create-task row
- `+ New task` under each swimlane
- `POST /wit/workitems/$Task` with `System.LinkTypes.Hierarchy-Reverse` to the Story
- Enter submits, cursor stays for next entry

### Phase 9 — Polish
- Keyboard nav (j/k/x/c)
- Settings page (PAT rotation, team switch, clear cache)
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
- Branch: `master`. Don't force-push. Don't skip hooks / bypass signing.
- `.claude/settings.local.json` is gitignored.
- After each build, close the old Jirafied tab and open a fresh one — old tabs run stale bundles.

See `CLAUDE.md` for durable project context + ADO gotchas.
