# CLAUDE.md

**Project:** Jirafied — a Chrome MV3 extension that replaces Azure DevOps' sprint taskboard (`dev.azure.com/.../_sprints/taskboard/`) with a Linear/Sentry-style full-tab app. Reads/writes go directly to the ADO REST API from the extension page; no backend.

See `STATUS.md` for phase status and what's in flight.

## Build & dev

- `pnpm build` — typechecks, then outputs loadable extension to `dist/`
- `pnpm dev` — Vite dev server with HMR via `@crxjs/vite-plugin`
- `pnpm typecheck` — just `tsc --noEmit`
- Load: `chrome://extensions` → Developer mode → Load unpacked → pick `dist/`
- **After each build, close the old Jirafied tab and open a fresh one.** Old tabs run stale bundles and look broken in ways that aren't your fault.

## Stack

- Vite 8 + React 19 + TypeScript 6
- `@crxjs/vite-plugin` (MV3) with `@vitejs/plugin-react` — **don't switch to the SWC variant**, it has HMR friction with crxjs
- Tailwind 4 via `@tailwindcss/vite`. CSS tokens live in `src/app/globals.css` `@theme {}`
- `@fontsource-variable/inter` bundled (self-hosted — MV3 CSP forbids CDN fonts)
- TanStack Query (data) + Zustand with `persist` middleware (settings + UI state)
- `@hello-pangea/dnd` for drag-and-drop (chosen over `pragmatic-drag-and-drop` for built-in placeholder + push animation on Kanban-shaped boards)
- `lucide-react` icons, `class-variance-authority` + `clsx` + `tailwind-merge` for primitives
- No automated tests in v1; manual verification against a live ADO org

## File map

```
src/
  ado/
    client.ts            # fetch wrapper — PAT Basic auth; ado(), adoRaw(), adoPaged() follow x-ms-continuationtoken
    endpoints.ts         # typed wrappers — all paths scoped by projectId/teamId (GUIDs)
    types.ts             # ADO JSON shapes + DEFAULT_WORKITEM_FIELDS
    hooks/
      useCurrentIteration.ts  # $timeframe=current
      useTaskboard.ts         # composes relations + columns + batch items into swimlanes
  state/
    settings.store.ts             # org, pat, projectId/name, teamId/name — chrome.storage.local
    collapsedLanes.store.ts       # collapsed-by-context; future: user swimlane reorder under same key
  lib/
    chrome-storage.ts    # Zustand persist StateStorage adapter around chrome.storage.local
    queryClient.ts       # TanStack Query defaults (30s stale, retry 400s=false)
    cn.ts                # clsx + tailwind-merge
  app/
    main.tsx, App.tsx    # hydration gate → Onboarding or Board
    globals.css          # @theme tokens, .lit-top, .mono, scrollbar
    onboarding/          # 3-step wizard: credentials → project → team
    board/
      Board.tsx          # h-screen + overflow-hidden (lets BoardGrid own the scroll)
      TopBar.tsx         # sticky backdrop-blur header
      BoardGrid.tsx      # DragDropContext + sticky column headers + Droppable cells; onDragEnd wires PATCH state + PATCH order with optimistic cache update
      SwimlaneHeader.tsx # role=button div (so copy-link can be a real nested button)
      TaskCard.tsx       # Draggable-wrapped card with lift shadow while isDragging
      CopyLinkButton.tsx # builds dev.azure.com/{org}/{project}/_workitems/edit/{id}
      Avatar.tsx         # initials underneath, <img> fade in on load (cookie auth)
      workItemVisuals.ts # type dots + muted avatar palette + initials/tags helpers
  components/ui/         # Button, Input, Label — minimal Linear-ish primitives
  background/
    service-worker.ts    # toolbar click → open or focus the full-tab app
  manifest.config.ts     # crxjs defineManifest, version from package.json
```

## ADO API gotchas (learned the hard way — keep in mind)

- **Taskboard customisation disagreement.** `GET /work/taskboardcolumns` returns `200 {columns:[], isCustomized:false}` when a team hasn't customized their board — which is the common case. In that state, `GET /work/taskboardworkitems/{iterationId}` will **400** with `"Taskboard columns are not added. Customize the taskboard columns before accessing it."`. So `useTaskboard` fetches columns first and only attempts `taskboardworkitems` when `isCustomized !== false && columns.length > 0`.
- **Column synthesis fallback.** When `taskboardworkitems` isn't usable, we synthesize one column per non-Removed Task state, ordered by state category (Proposed → InProgress → Resolved → Completed) and then by the API's state order. Matches what the native UI renders by default. See `synthesizeFromWorkItemType` in `useTaskboard.ts`.
- **Preview API versions.** `/taskboardcolumns` and `/taskboardworkitems` need `api-version=7.1-preview.1`. All other endpoints use GA `7.1`.
- **Continuation tokens.** `adoPaged()` reads `x-ms-continuationtoken` response header — ADO silently truncates pages otherwise. Used for projects/teams listing.
- **Batch limit.** `POST /_apis/wit/workitemsbatch` caps at 200 IDs per call. `getWorkItemsBatch` chunks and parallelises.
- **Don't write `Microsoft.VSTS.Common.StackRank` directly.** For reordering, use `PATCH /{project}/{team}/_apis/work/iterations/{iterationId}/workitemsorder` with `{ ids, previousId, nextId, parentId }` — `previousId`/`nextId` of `0` pin to the start/end of the lane, `parentId` of `0` means "no parent in this sprint" (Everything-else lane). The response is `{ count, value: [{id, order}] }`; use those `order` values to reconcile the optimistic update.
- **Reorder does NOT change state.** When a card moves columns, `PATCH /wit/workitems/{id}` (JSON-Patch `add` op on `/fields/System.State`) *first*, then reorder. The target state comes from `column.mappings[workItemType]`.
- **MV3 + host_permissions bypass CORS.** The extension page can `fetch('https://dev.azure.com/...')` directly — no proxy, no backend.
- **No realtime from ADO.** No SignalR / push. We use 30s foreground polling (`refetchIntervalInBackground: false`).

## Auth model

- PAT with scope **Work Items (Read & write)** (`vso.work_write`) — enough for all current board reads/writes.
- PAT goes in HTTP Basic `Authorization: Basic ${btoa(':' + pat)}` — PAT in password slot, empty user.
- Stored in `chrome.storage.local`. Not encrypted — extension origin is already isolated.
- **Avatars do not use the PAT.** They load via `<img src={imageUrl}>`, and the browser sends the user's `dev.azure.com` session cookie automatically for cross-origin image requests (MV3 + host_permissions). No `vso.graph`/`vso.profile` scope required; if the user isn't logged in to dev.azure.com, initials show.

## Styling conventions

- Near-black canvas `#08080a`, surface `#141418`, hairline border `rgb(255 255 255 / 0.06)`. Defined in `globals.css` `@theme`.
- `.lit-top` utility = `box-shadow: inset 0 1px 0 0 rgb(255 255 255 / 0.05)` — the Linear "emerging from surface" card look. Use on cards, chips, onboarding panel.
- `.mono` utility = mono font with `ss02 zero cv01` features. Use for work-item IDs and counts.
- **Gradients only on the "Jirafied" wordmark.** Primary buttons are pearled/glass (`bg-white/[0.09] backdrop-blur-xl border border-white/[0.14] lit-top`) — the previous indigo→violet gradient was AI-slop-y and was removed in the Phase 6 polish pass. Don't add gradients anywhere else.
- Work-item type is rendered as **colored dot + short label**, not a filled pill. Colors in `workItemVisuals.ts`.
- Avatars use a deterministic 8-tone muted palette (`AVATAR_PALETTE` in `workItemVisuals.ts`), not full-saturation HSL.
- Swimlane row order (until user-reorder lands): `Feature (0) → Epic (1) → Story/PBI/Issue (2) → Task (3) → Bug (4)`, alphabetical within tier.
- **Cards within a column are NOT sorted client-side.** We render them in the array order ADO returned (relations order from `/iterations/{id}/workitems` + the hierarchy built in `useTaskboard`). ADO's returned order already reflects StackRank, which is the source of truth the reorder API mutates. Sorting client-side would either duplicate or fight that order. On drag, we splice the card into its new array position (see `moveCard` in `BoardGrid.tsx`); we deliberately do *not* apply the `ReorderResult[].order` values from the reorder response because that response is partial and mixing partial fresh orders with stale neighbor orders produces a visible "revert" snap.
- **Drop-flicker nuance** (load-bearing). hello-pangea/dnd's drop animation runs FLIP and measures the Draggable's new home position in the DOM right after `onDragEnd` returns. Updating through `queryClient.setQueryData` alone does *not* propagate fast enough — its observers go through `useSyncExternalStore`, which isn't flushable with `flushSync` from an event handler, so the library measures the old DOM, animates the card back to source, and we see a flash before React finally commits the cache update. The fix in `BoardGrid.tsx` is: local `useState` overlay → `flushSync(() => setOverlay(next))` for the drop-animation-critical sync render → `setQueryData(next)` in parallel for refetch safety → clear overlay `onSettled`. Render uses `overlay ?? data`. Do not remove the overlay: the flicker comes back. Also keep the `transitionDuration: 0.001s` skip on `isDropAnimating` in TaskCard — it's a second line of defense and documented in the hello-pangea drop-animation guide.

## Git conventions

- `feat|fix|style|chore|perf: short summary` + body paragraph + `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- Branch: `master`. Never force-push. Never skip hooks (`--no-verify`) or bypass signing unless explicitly asked.
- `.claude/settings.local.json` is gitignored.

## Out of scope for v1

- Azure DevOps Server (on-prem) — Services only.
- OAuth / Azure AD — PAT only for v1. `ado/client.ts` is structured so OAuth can slot in later.
- Automated tests — manual verification only; add Playwright in v1.1.
- Chrome Web Store submission — load unpacked for now.
