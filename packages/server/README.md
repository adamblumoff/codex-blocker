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

# Remove setup (no-op)
npx codex-blocker --remove

# Show help
npx codex-blocker --help
```

## How It Works

1. **Codex sessions** — The server tails Codex session logs under `~/.codex/sessions`
   to detect activity.

2. **Server** — Runs on localhost and:
   - Tracks active Codex sessions
   - Marks sessions "working" when new log lines arrive
   - Broadcasts state via WebSocket to the Chrome extension

3. **Extension** — Connects to the server and:
   - Blocks configured sites when no sessions are working
   - Shows a modal overlay (soft block, not network block)
   - Updates in real-time without page refresh

## API

### HTTP Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/status` | GET | Returns current state (sessions, blocked status) |

### WebSocket

Connect to `ws://localhost:8765/ws` to receive real-time state updates:

```json
{
  "type": "state",
  "blocked": true,
  "sessions": 1,
  "working": 0
}
```

## Programmatic Usage

```typescript
import { startServer } from 'codex-blocker';

// Start on default port (8765)
startServer();

// Or custom port
startServer(9000);
```

## Requirements

- Node.js 18+
- Codex CLI

## License

MIT
