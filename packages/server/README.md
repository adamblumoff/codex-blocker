# codex-blocker

CLI tool and server for Codex Blocker — block distracting websites unless Codex is actively running.

## Installation

```bash
npm install -g codex-blocker
# or
npx codex-blocker
```

## Quick Start

```bash
# Optional setup info
npx codex-blocker --setup
```

## Usage

```bash
# Start server (default port 8765)
npx codex-blocker

# Show setup info
npx codex-blocker --setup

# Custom port
npx codex-blocker --port 9000

# Enable mobile/LAN mode
npx codex-blocker --mobile

# Override bind host
npx codex-blocker --mobile --bind 0.0.0.0

# Set mobile discovery name
npx codex-blocker --mobile --mobile-name "Codex Blocker"

# Remove setup (no-op)
npx codex-blocker --remove

# Show help
npx codex-blocker --help

# Show version
npx codex-blocker --version
```

## How It Works

1. **Codex sessions** — The server tails Codex session logs under `~/.codex/sessions`
   to detect activity. It marks a session “working” on your prompt and on intermediate
   assistant/tool activity, marks `waiting_for_input` when Codex emits
   `request_user_input`, and marks “idle” when it sees a terminal assistant reply
   (`phase: "final_answer"`), with legacy fallback support for older Codex logs.

2. **Server** — Runs locally and:
   - Tracks active Codex sessions
   - Marks sessions "working" when new log lines arrive
   - Broadcasts state via WebSocket to the Chrome extension
   - Can optionally run in LAN mode for iOS mobile clients

3. **Extension** — Connects to the server and:
   - Blocks configured sites when no sessions are working, or when any session is waiting for user input
   - Shows a modal overlay (soft block, not network block)
   - Updates in real-time without page refresh

4. **Mobile App (optional)** — In `--mobile` mode:
   - Exposes discovery and pairing endpoints over local Wi-Fi
   - Publishes an mDNS service (`_codex-blocker._tcp`)
   - Supports token-authenticated `/status` + `/ws` from the iOS Expo app

## API

### HTTP Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/status` | GET | Returns current state (sessions, blocked status) |
| `/mobile/discovery` | GET | Returns local discovery metadata for mobile clients |
| `/mobile/pair/start` | POST | Creates a one-time 6-digit pairing code (2 minute TTL) |
| `/mobile/pair/confirm` | POST | Exchanges valid pairing code for auth token + endpoint URLs |

### WebSocket

Connect to `ws://localhost:8765/ws` to receive real-time state updates:

```json
{
  "type": "state",
  "blocked": true,
  "sessions": 1,
  "working": 0,
  "waitingForInput": 1
}
```

Include `?token=<token>` when connecting from mobile clients.

## Programmatic Usage

```typescript
import { startServer } from 'codex-blocker';

// Start on default port (8765)
startServer();

// Or custom port
startServer(9000);

// Enable mobile mode
startServer(8765, { mobile: true });

// Explicit bind host
startServer(8765, { mobile: true, bindHost: "0.0.0.0" });
```

## Requirements

- Node.js 18+
- Codex CLI

## Additional Docs

- Mobile connectivity details: `../../docs/mobile-connectivity.md`
- Zero-admin setup roadmap: `../../docs/mobile-zero-admin-ux-plan.md`

## License

MIT
