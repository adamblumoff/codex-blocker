# @codex-blocker/mobile

Expo SDK 55 TypeScript app for Codex Blocker iPhone workflows.

## Development (Expo Go)

```bash
# from repo root
pnpm --filter @codex-blocker/mobile dev
```

## Server requirements

Run the server in mobile mode so the app can discover and pair:

```bash
npx codex-blocker --mobile
```

## Current capabilities

- Auto-discovery over local Wi-Fi (`/mobile/discovery`)
- Terminal-code pairing (`/mobile/pair/start` + `/mobile/pair/confirm`)
- Realtime state updates from `/ws`
- Local notification toggle for Codex idle/resume transitions
- Blocking mode toggle placeholder (full iOS Screen Time shielding requires dev build with native module)
