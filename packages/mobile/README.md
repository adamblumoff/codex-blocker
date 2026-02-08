# @codex-blocker/mobile

Expo SDK 55 TypeScript app for Codex Blocker iPhone workflows.

## Development (Expo Go)

```bash
# from repo root
pnpm --filter @codex-blocker/mobile dev
```

## Server requirements

Run the server so the app can discover and pair:

```bash
npx codex-blocker
```

## Current capabilities

- Auto-discovery over local Wi-Fi (`/mobile/discovery`)
- QR-only pairing (`/mobile/pair/start` + `/mobile/pair/confirm`)
- Realtime state updates from `/ws`
- Session-only auth token (in memory only) + pinned server identity (`instanceId`)
- Local notification toggle for Codex idle/resume transitions
- Blocking mode toggle placeholder (full iOS Screen Time shielding requires dev build with native module)
