# Privacy Policy — Giraffied

_Last updated: April 23, 2026_

Giraffied is a Chrome extension that renders your Azure DevOps sprint taskboard in a Linear-style interface. This policy explains exactly what data the extension touches and where it goes.

## What Giraffied stores

Giraffied stores the following items **locally**, using the browser's `chrome.storage.local` API, scoped to the extension's origin:

- Your Azure DevOps organization URL (e.g., `https://dev.azure.com/your-org`).
- A Personal Access Token (PAT) that you create and paste in during onboarding.
- The project and team you've selected (IDs and display names).
- UI state: collapsed swimlanes, last-opened sprint.

That's the entire data footprint. Nothing else is persisted.

## Where your data goes

- **Stays on your machine:** everything listed above. `chrome.storage.local` is not synced to your Google account and is not transmitted to any Giraffied-operated server, because Giraffied does not operate any servers.
- **Sent to Azure DevOps only:** your PAT is attached to outgoing HTTPS requests made directly from your browser to `https://dev.azure.com/*` so the extension can read and write work items on your behalf. The PAT travels to Microsoft's Azure DevOps service and nowhere else.
- **Avatars:** work-item assignee avatars load directly from `https://dev.azure.com` using your existing browser session cookie. No PAT is used for avatars.

## What Giraffied does not do

- Does **not** collect analytics, telemetry, crash reports, or usage data.
- Does **not** contact any third-party service other than Azure DevOps.
- Does **not** sell, share, or transfer user data to third parties.
- Does **not** use remote code. All JavaScript that executes is shipped inside the extension package.
- Does **not** read or modify any website outside `dev.azure.com` host permissions.
- Does **not** inject content scripts into web pages; the extension only opens its own full-tab page.

## Permissions, explained

- `storage` — used only to save the settings and UI state described above.
- `host_permissions: https://dev.azure.com/*` — used so the extension can call the Azure DevOps REST API directly from the browser, without a proxy server.

## Your controls

- **Revoke access at any time:** delete or regenerate the PAT in Azure DevOps → User settings → Personal access tokens. The next Giraffied request will fail until you paste a new one.
- **Clear all local data:** right-click the Giraffied icon → Remove from Chrome, or open `chrome://extensions` → Remove.
- **Rotate credentials:** open Giraffied settings and paste a new PAT; the previous value is overwritten immediately.

## Contact

For questions about this policy, contact guzmanoj@altack.com.
