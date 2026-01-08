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
3. **Chrome extension** blocks configured sites when no session is actively working

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
You can also mute blocking, enable always-blocking, or pause media while blocked from Settings.

Default blocked sites: `x.com`, `youtube.com`

## Server CLI

```bash
# Start on custom port
npx codex-blocker --port 9000

# Show setup info
npx codex-blocker --setup

# Show help
npx codex-blocker --help

# Show version
npx codex-blocker --version
```

## Features

- **Soft blocking** — Sites show a modal overlay, not a hard block
- **Rotating nudges** — Friendly, rotating phrases in the block modal
- **Real-time updates** — No page refresh needed when state changes
- **Multi-session support** — Tracks multiple Codex instances
- **Emergency bypass** — 5-minute bypass, once per day
- **Configurable sites** — Add/remove sites from extension settings
- **Mute blocking** — Toggle blocking on/off without disabling the extension
- **Always blocking** — Force blocking regardless of Codex activity
- **Pause media** — Auto-pause audio/video while blocked and resume on unblock
- **Works offline** — Blocks everything when server isn't running (safety default)

## Requirements

- Node.js 18+
- Chrome (or Chromium-based browser)
- Codex CLI

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

# Run tests
pnpm test

# Run tests with coverage (report is printed to terminal only)
pnpm test:coverage
```

### Project Structure

```
packages/
├── server/      # Node.js server + CLI (published to npm)
├── extension/   # Chrome extension (Manifest V3)
└── shared/      # Shared TypeScript types
```

## Privacy

- **No data collection** — All data stays on your machine
- **Local only** — Server runs on localhost, no external connections
- **Chrome sync** — Blocked sites list syncs via your Chrome account (if enabled)

See [PRIVACY.md](PRIVACY.md) for full privacy policy.

## License

MIT © [Theo Browne](https://github.com/t3dotgg)
