# Mobile Connectivity (iOS + Extension + Local Server)

## Read When
- You are working on iPhone/mobile connectivity.
- You are debugging pairing/auth between server, extension, and mobile.
- You are diagnosing Windows + WSL + LAN reachability.

## Overview

`codex-blocker` now starts one unified server mode by default:

- `npx codex-blocker`
- `npx codex-blocker --extension-only` for localhost-only extension mode (mobile LAN discovery disabled)
- `npx codex-blocker mobile:doctor`
- `npx codex-blocker mobile:fix`
- `npx codex-blocker mobile:fix --allow-public` only when Public-profile Wi-Fi access is required
- `npx codex-blocker mobile:remove` to undo networking setup created by `mobile:fix`

Default behavior:

- Binds to `0.0.0.0`
- Publishes mDNS service `_codex-blocker._tcp`
- Exposes pairing/discovery endpoints:
  - `GET /mobile/discovery`
  - `POST /mobile/pair/start`
  - `POST /mobile/pair/confirm`
- Exposes auth-protected endpoints:
  - `GET /status`
  - `GET ws://<host>:8765/ws` (token via query/header/subprotocol)

SECURITY NOTE: RUN `npx codex-blocker mobile:remove` WHEN YOU ARE DONE USING MOBILE LAN ACCESS.

## Extension-Only Mode

Use this when you only want browser extension support and do not want mobile LAN setup:

```bash
npx codex-blocker --extension-only
```

Behavior:

- Default bind host changes to `127.0.0.1` on native installs and `0.0.0.0` on Windows/WSL (unless `--bind` is explicitly provided).
- mDNS publishing is disabled.
- Terminal QR pairing output is disabled (numeric code output remains).
- Startup `mobile:doctor`/`mobile:fix` auto-run is disabled.
- Extension pairing still works on localhost.

## End-to-End Pairing Flow

1. Server starts and prints a mobile pairing QR in terminal (short-lived, one-time nonce).
2. Client discovers server (`/mobile/discovery`).
3. Client ensures pairing window (`/mobile/pair/start`).
4. Mobile app scans terminal QR and posts nonce to `/mobile/pair/confirm`.
5. Extension can still pair by entering code into `/mobile/pair/confirm`.
6. Client connects to `/status` + `/ws` with that token.

Mobile app pairing UX:

- Pairing screen includes `Scan QR` and `Refresh QR`.
- When `qrExpiresAt` is reached, app shows an in-app expiry banner and requires refresh.

`/mobile/pair/start` response now includes:

- `expiresAt` (overall pairing window)
- `qrExpiresAt` (current QR nonce expiry)
- `qrFormat` (`cbm-v1`)

Pairing brute-force guard:

- 6 failed confirms per minute lock pairing confirms for that client for 2 minutes.
- Extension shows a lockout-specific message when this limit is hit.
- Extension "Refresh Terminal Code" requests a freshly regenerated 6-digit code.

## Session Security Model

- Server token is in-memory only (not persisted to disk).
- Restarting server invalidates all prior client tokens.
- Mobile app cold start always requires scanning a fresh terminal QR.
  - Mobile persists only host + `instanceId`.
  - Mobile does **not** persist auth token.
- Extension stores token in `chrome.storage.session`.
  - Service-worker restarts in same browser session keep token.
  - Full browser restart requires re-pairing.

## Startup Doctor/Fix Behavior

On Windows/WSL environments, server startup runs doctor automatically:

1. `mobile:doctor`
2. If unhealthy, `mobile:fix`

Disable this with:

- `npx codex-blocker --no-auto-fix`
- `npx codex-blocker --mobile-no-auto-fix` (legacy alias)

## Windows + WSL Notes

Common symptom:

- Windows localhost works (`http://localhost:8765/mobile/discovery`)
- iPhone LAN URL fails (`http://<windows-wifi-ip>:8765/mobile/discovery`)

Typical recovery:

1. Run server: `npx codex-blocker`
2. Run doctor: `npx codex-blocker mobile:doctor`
3. If needed, run fix:
   - Private-only: `npx codex-blocker mobile:fix`
   - Public Wi-Fi: `npx codex-blocker mobile:fix --allow-public`
4. Re-run doctor until all checks are `[OK]`.

If Windows LAN succeeds but iPhone still fails:

- Check AP/client isolation on the Wi-Fi network.
- On restrictive campus/guest networks (for example eduroam variants), peer LAN traffic may be blocked.
- Use a personal hotspot where both laptop and phone are on the same local network.

## Troubleshooting Checklist

1. WSL server local:
   - `curl http://127.0.0.1:8765/mobile/discovery`
2. Windows localhost:
   - `Invoke-RestMethod http://localhost:8765/mobile/discovery`
3. Windows LAN:
   - `Invoke-RestMethod http://<windows-wifi-ip>:8765/mobile/discovery`
4. iPhone Safari:
   - `http://<windows-wifi-ip>:8765/mobile/discovery`
5. App-level:
   - `pnpm dev:mobile` (tunnel + clear)
   - Verify phase flow: `discovering -> pairing -> connected`

## Reset Networking State (for testing fix/remove)

Preferred:

```bash
npx codex-blocker mobile:remove
```

Equivalent Administrator PowerShell cleanup:

```powershell
netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=8765
netsh interface portproxy delete v4tov4 listenaddress=127.0.0.1 listenport=8765
Remove-NetFirewallRule -DisplayName "Codex Blocker 8765 Private LocalSubnet" -ErrorAction SilentlyContinue
Remove-NetFirewallRule -DisplayName "Codex Blocker 8765 Public LocalSubnet" -ErrorAction SilentlyContinue
Remove-NetFirewallRule -DisplayName "Codex Blocker 8765" -ErrorAction SilentlyContinue
```
