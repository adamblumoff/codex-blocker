# Privacy Policy for Codex Blocker

**Last updated:** January 2, 2026

## Overview

Codex Blocker is a productivity tool that blocks distracting websites when Codex is not actively working. This privacy policy explains what data is collected and how it's used.

## Data Collection

### What We Collect

Codex Blocker collects and stores the following data **locally on your device**:

1. **Blocked Domains List** — The websites you configure to be blocked (default: x.com, youtube.com)
2. **Bypass State** — Whether you've used your daily emergency bypass, and when it expires
3. **Last Bypass Date** — The date of your last bypass usage (to enforce once-per-day limit)

### What We Don't Collect

- No browsing history
- No personal information
- No analytics or telemetry
- No usage statistics
- No data sent to external servers

## Data Storage

All data is stored using Chrome's `chrome.storage.sync` API:

- **Local storage** — Data is stored on your device
- **Chrome sync** — If you have Chrome sync enabled, your blocked domains list will sync across your devices via your Google account
- **No external servers** — We do not operate any servers that receive your data

## Server Communication

The extension communicates only with a **local server running on your machine** (`localhost:8765`). This server:

- Runs entirely on your computer
- Never connects to the internet
- Reads Codex session logs stored locally on your machine

## Third-Party Services

Codex Blocker does not use any third-party services, analytics, or tracking.

## Data Deletion

To delete all Codex Blocker data:

1. Open Chrome extension settings
2. Click on Codex Blocker → "Remove"
3. All locally stored data will be deleted

Alternatively, clear the extension's storage via Chrome DevTools.

## Permissions Explained

| Permission | Why We Need It |
|------------|----------------|
| `storage` | Store your blocked domains list and bypass state |
| `tabs` | Send state updates to open tabs when blocking status changes |
| `<all_urls>` | Inject the blocking modal on any website you configure |

## Children's Privacy

Codex Blocker is not directed at children under 13 and does not knowingly collect data from children.

## Changes to This Policy

We may update this privacy policy from time to time. Changes will be posted to this page with an updated revision date.

## Contact

For questions about this privacy policy, please open an issue at:
https://github.com/t3-content/claude-blocker/issues

## Open Source

Codex Blocker is open source software. You can review the complete source code at:
https://github.com/t3-content/claude-blocker
