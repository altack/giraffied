# Chrome Web Store listing — ready-to-paste copy

Paste these values straight into the CWS Developer Dashboard when submitting Giraffied. Everything here is sized to fit the field limits and matches what the manifest declares.

---

## Item name (max 50 chars)

```
Giraffied — Sprint Board for Azure DevOps
```
_(42 chars, including the em dash)_

---

## Summary / short description (max 132 chars)

```
A fast, Linear-style sprint taskboard for Azure DevOps. Drag cards across columns, reorder swimlanes, keep your sprint in flow.
```
_(128 chars — matches the manifest description exactly.)_

---

## Category

`Workflow & Planning`

---

## Language

`English (United States)`

---

## Detailed description

```
Giraffied replaces the Azure DevOps sprint taskboard with a full-tab, Linear-style experience. No tabs to click through, no cramped columns, no forced modals — just your sprint, the way a modern issue tracker renders it.

WHAT IT DOES
• Swimlane rows by parent work item (Feature → Epic → Story/PBI/Bug → Task), grouped the way your eye already reads the board.
• Columns reflect your team's taskboard customization; if your team hasn't customized one, Giraffied synthesizes columns from the work item type's state flow, matching the native UI.
• Drag a card between columns to change its state. Drag within a column to reorder. Cross-parent drops move the card into that parent's lane. All writes go directly to the Azure DevOps REST API.
• Keyboard and mouse feel tuned for speed — sticky column headers, instant swimlane collapse, copy-link-to-work-item button on every card, Linear-style omnisearch across the active sprint.

HOW IT CONNECTS TO AZURE DEVOPS
• Paste a Personal Access Token (scope: Work Items — Read & write) during the three-step onboarding. Pick your project, pick your team, you're in.
• The extension calls dev.azure.com directly from your browser. There is no backend and no proxy, so your PAT never leaves your machine except to talk to Azure DevOps itself.
• Foreground polling keeps the board current; no background refreshes, no realtime connections, nothing running when the tab is closed.

WHAT IT DOESN'T DO
• No analytics. No telemetry. No ads. No remote code.
• No contact with any third-party service beyond dev.azure.com.
• No content scripts, no page modifications — the extension only opens its own full-tab app.

REQUIREMENTS
• An Azure DevOps Services account (the cloud product at dev.azure.com). Azure DevOps Server (on-prem) is not supported yet.
• A Personal Access Token with Work Items (Read & write) scope.

Source, issues, and changelog: https://github.com/altack/giraffied
```

---

## Single purpose description

> Giraffied provides a single, focused UI: a fast, full-tab sprint taskboard for Azure DevOps. It replaces the native taskboard for users who want a Linear-style read/write experience over the same data, using the Azure DevOps REST API.

---

## Permission justifications

_(These map 1:1 to the manifest. The dashboard will ask for each one.)_

### `storage`

> Used to persist the user's Azure DevOps organization URL, their Personal Access Token, their selected project/team, and a small amount of UI state (collapsed swimlanes, last-opened sprint). All data is stored locally via `chrome.storage.local` and never leaves the user's device.

### Host permission: `https://dev.azure.com/*`

> The extension calls the Azure DevOps REST API directly from the browser to list sprints, read the taskboard, and update work item state / order when the user drags cards. Narrowly scoped to Azure DevOps Services (`dev.azure.com`); no other hosts are accessed. Required because Giraffied has no backend — all read/write traffic is client-to-ADO.

### `active_tab` / `scripting` / `tabs`

> **Not used.** Giraffied does not inject content scripts and does not read or modify any non-extension page.

---

## Data usage disclosures (Privacy tab)

Check **only** this box and leave the rest unchecked:

- [x] **Authentication information** — the Personal Access Token, pasted during onboarding and persisted in `chrome.storage.local`. Never transmitted off the device except as the `Authorization` header on outgoing calls to `https://dev.azure.com`.

Leave these unchecked — the data passes through the renderer but Giraffied does not "collect" it in the CWS sense (no persistent storage, no transmission to any destination we control):

- [ ] **Personally identifiable information** — assignee names/emails appear inside work-item payloads we fetch from Azure DevOps, but they live only in the in-memory TanStack Query cache for the lifetime of the tab. Nothing is written to `chrome.storage.local` or sent elsewhere.
- [ ] **Website content** — work item titles, descriptions, tags, and states are fetched from the user's own Azure DevOps account and rendered; the extension is the display surface, not a collector.
- [ ] Health / Financial / Personal communications / Location / Web history / User activity — none of these apply.

_Note: the organization URL and selected project/team IDs are persisted in `chrome.storage.local` but don't map to any of the CWS categories above — they're user-provided configuration, not observed or identifying data, so there's nothing to check on their behalf._

For the three sworn certifications, the correct answers are:

- [x] I do not sell or transfer user data to third parties, apart from the approved use cases.
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** `https://github.com/altack/giraffied/blob/main/PRIVACY.md`

---

## Promotional assets checklist

- [ ] **Store icon** — 128×128 PNG (already in repo: `icons/icon-128.png`).
- [ ] **Small promo tile** — 440×280 PNG (required).
- [ ] **Screenshots** — 1280×800 or 640×400 PNG, at least one, up to five recommended. Capture: onboarding step 1, populated board with swimlanes, drag-in-progress with the card lifted, omnisearch open.
- [ ] **Marquee tile** — 1400×560 PNG (optional, but improves placement).

_(The 440×280 tile and screenshots are the only things missing from this repo. Everything else is ready.)_

---

## Review fast-lane checklist

Reviewers flag these — the current manifest avoids all of them:

- [x] Single narrow host permission (`dev.azure.com` only), no `<all_urls>`.
- [x] No `web_accessible_resources` (nothing is embedded by external pages).
- [x] No remote code execution; all JS ships in the package.
- [x] No content scripts.
- [x] Single clearly-stated purpose.
- [x] Privacy policy URL reachable and describes data handling accurately.
- [x] Permission justifications provided for every declared permission.
- [x] Minimum Chrome version declared (`114`).
- [x] Icons provided at 16, 32, 48, 128.
- [x] `author` and `homepage_url` set.
