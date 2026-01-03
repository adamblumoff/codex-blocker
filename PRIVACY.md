# Privacy Policy for Codex Blocker

**Last updated:** January 3, 2026

## Summary

Codex Blocker is a local‑only productivity tool. The extension and server run on your machine and do not send your data to external services.

## Data We Store (Local Only)

Codex Blocker stores a small amount of data on your device to function:

- **Blocked sites list** — The domains you choose to block (defaults include `x.com` and `youtube.com`).
- **Bypass status** — Whether a daily 5‑minute bypass is active and when it expires.
- **Bypass date** — The last day you used the bypass (to enforce once‑per‑day).

## Data We Do Not Collect

- No browsing history
- No personal information
- No analytics, telemetry, or usage tracking
- No data sent to third‑party servers

## Where Data Lives

Extension data is stored using Chrome’s extension storage:

- **Local device storage** for all settings
- **Optional Chrome sync** if you have sync enabled

## Local Server Behavior

The extension talks only to a **local server** on your computer (`http://localhost:8765`):

- The server does not accept internet traffic
- It does not transmit data externally
- It reads Codex session logs stored locally to detect activity

## Permissions

| Permission | Purpose |
|---|---|
| `storage` | Save blocked sites and bypass state |
| `tabs` | Notify open tabs when blocking status changes |
| `<all_urls>` | Show the blocking overlay on any site you choose to block |

## Deleting Data

To remove all Codex Blocker data:

1. Open Chrome’s Extensions page
2. Remove Codex Blocker
3. (Optional) Clear extension storage via Chrome DevTools

## Updates

We may update this policy as the product changes. The “Last updated” date will reflect changes.

## Contact

Questions? Please open an issue:
https://github.com/adamblumoff/codex-blocker/issues

## Open Source

Codex Blocker is open source. Source code is available at:
https://github.com/adamblumoff/codex-blocker
