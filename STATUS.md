# Jirafied — Status

Last worked on: **2026-04-21**

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
- Default row sort: Feature → Epic → Story/PBI/Issue → Task → **Bug (bottom)**, alphabetical within tier; card sort alphabetical

---

## Remaining

### Phase 4 — Drag cards between columns

### Phase 5 — Reorder within column

### Phase 6 — Quick-edit slide-over
- Click card → right-side panel
- Edit Title, State, AssignedTo (from `teams/{team}/members`), Story Points, Remaining Work, Tags
- PATCH on save + optimistic update

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
