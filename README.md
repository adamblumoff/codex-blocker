# Codex Blocker

Block distracting websites unless Codex is actively running inference.

**The premise is simple:** if Codex is working, you should be too. When Codex stops, your distractions come back.

**Acknowledgment:** Codex Blocker is a fork of Claude Blocker by Theo Browne (t3dotgg). This project builds on his original idea and implementation.

## How It Works

```
┌─────────────────┐  session logs  ┌─────────────────┐    websocket    ┌─────────────────┐
│     Codex       │ ─────────────► │  Blocker Server │ ◄─────────────► │ Chrome Extension│
│   (terminal)    │                │  (localhost)    │                 │   (browser)     │
└─────────────────┘                └─────────────────┘                 └─────────────────┘
       │                                   │                                   │
       │ log writes                         │ tracks sessions                   │ blocks sites
       │                                   │ broadcasts state                  │ shows modal
       │                                   │                                   │ bypass button
       └───────────────────────────────────┴───────────────────────────────────┘
```

1. **Codex session logs** are tailed by the server to detect activity
2. **Blocker server** tracks Codex turns (working starts on your prompt, ends on final reply)
3. **Clients** subscribe to server state:
   - Chrome extension blocks configured websites
   - iOS Expo app receives state over LAN/Wi-Fi for notifications and mobile mode controls

## Quick Start

### 1. Install the server

```bash
# One-off (recommended)
npx codex-blocker

# Or install globally
npm install -g codex-blocker
# pnpm add -g codex-blocker

# Then run
codex-blocker
```

This starts the server. No hooks are required; the server reads Codex session logs from `~/.codex/sessions`.

### 2. Install the Chrome extension

- Download from [Chrome Web Store](#) *(coming soon)*
- Or load unpacked from `packages/extension/dist`

### 3. Configure blocked sites

Click the extension icon → Settings to add sites you want blocked when Codex is idle.
You can also mute blocking, enable always-blocking, pause media while blocked, or toggle Roast mode from Settings.

Default blocked sites: `x.com`, `youtube.com`

### 4. Run the iOS app (Expo Go)

```bash
# Start server in mobile/LAN mode
npx codex-blocker --mobile

# In another terminal
pnpm --filter @codex-blocker/mobile dev
```

Then open Expo Go on iPhone and connect to the project.
When pairing is required, enter the 6-digit code shown in the server terminal.

## Server CLI

```bash
# Start on custom port
npx codex-blocker --port 9000

# Enable mobile mode (LAN bind + mDNS + pairing endpoints)
npx codex-blocker --mobile

# Enable mobile mode without startup auto doctor/fix
npx codex-blocker --mobile --mobile-no-auto-fix

# Override bind host
npx codex-blocker --mobile --bind 0.0.0.0

# Set mobile discovery name
npx codex-blocker --mobile --mobile-name "Adam's Codex Blocker"

# Diagnose local mobile networking (Windows/WSL)
npx codex-blocker mobile:doctor

# Auto-fix Windows portproxy + firewall (prompts for elevation if needed)
npx codex-blocker mobile:fix

# Explicitly allow Public-profile firewall access (higher risk)
npx codex-blocker mobile:fix --allow-public

# Remove Windows portproxy + firewall rules created by mobile:fix
npx codex-blocker mobile:remove

# Show setup info
npx codex-blocker --setup

# Show help
npx codex-blocker --help

# Show version
npx codex-blocker --version
```

SECURITY NOTE: IF YOU ENABLE MOBILE ACCESS, RUN `npx codex-blocker mobile:remove` WHEN YOU ARE DONE TO REMOVE FIREWALL/PORTPROXY EXPOSURE.
`mobile:fix` opens Private-profile firewall by default; Public-profile access requires `--allow-public`.

## Features

- **Soft blocking** — Sites show a modal overlay, not a hard block
- **Rotating nudges** — Friendly, rotating phrases in the block modal
- **Roast mode** — Optional snarky phrases (toggle in popup or settings)
- **Real-time updates** — No page refresh needed when state changes
- **Multi-session support** — Tracks multiple Codex instances
- **Emergency bypass** — 5-minute bypass, once per day
- **Configurable sites** — Add/remove sites from extension settings
- **Mute blocking** — Toggle blocking on/off without disabling the extension
- **Always blocking** — Force blocking regardless of Codex activity
- **Pause media** — Auto-pause audio/video while blocked and resume on unblock
- **Works offline** — Blocks everything when server isn't running (safety default)
- **Mobile LAN mode** — Optional pairing/discovery endpoints for iPhone app connections
- **Expo iOS app (TypeScript)** — Realtime status, notifications toggle, and mobile blocking-mode controls
- **Loopback-only extension bootstrap** — Initial extension token bootstrap is restricted to local loopback clients

## Requirements

- Node.js 18+
- Chrome (or Chromium-based browser)
- Codex CLI
- iPhone + Expo Go (for mobile app development)

## Development

```bash
# Clone and install
git clone https://github.com/adamblumoff/codex-blocker.git
cd codex-blocker
pnpm install

# Build everything
pnpm build

# Development mode
pnpm dev

# Mobile app only (Expo)
pnpm dev:mobile

# All workspace dev scripts
pnpm dev:all

# Run tests
pnpm test

# Run tests with coverage (report is printed to terminal only)
pnpm test:coverage
```

## Mobile Docs

- Connectivity and troubleshooting: `docs/mobile-connectivity.md`
- Zero-admin setup roadmap: `docs/mobile-zero-admin-ux-plan.md`

### Project Structure

```
packages/
├── server/      # Node.js server + CLI (published to npm)
├── extension/   # Chrome extension (Manifest V3)
├── mobile/      # Expo React Native iOS app (TypeScript)
└── shared/      # Shared TypeScript types
```

## Release Automation

Tag pushes (`v*`) trigger `.github/workflows/release.yml`.

- Stable tags (for example `v0.1.2`) run:
  - test/build/zip
  - Chrome Web Store upload + publish
  - npm publish (`codex-blocker`)
  - GitHub release creation with `packages/extension/codex-blocker.zip`
- Prerelease tags (`-alpha`) skip Chrome Web Store publish.

Required GitHub repository secrets for Chrome Web Store automation:

- `CWS_EXTENSION_ID`
- `CWS_PUBLISHER_ID`
- `CWS_CLIENT_ID`
- `CWS_CLIENT_SECRET`
- `CWS_REFRESH_TOKEN`

Manual smoke tests (no tag required) can be run from Actions on `release.yml` using
the `workflow_dispatch` trigger:

- Default smoke run validates auth + fetches CWS status.
- Optional upload smoke run (`cws_check_upload=true`) also builds/zips and uploads
  the extension package, but does not publish it.
- If the existing item is currently under Chrome Web Store review, the upload smoke
  step reports a non-fatal `NOT_UPDATEABLE` notice instead of failing the entire smoke run.

## Privacy

- **No data collection** — All data stays on your machine
- **Local only** — Server runs on localhost, no external connections
- **Chrome sync** — Blocked sites list syncs via your Chrome account (if enabled)

See [PRIVACY.md](PRIVACY.md) for full privacy policy.

## License

MIT © [Theo Browne](https://github.com/t3dotgg)
