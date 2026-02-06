# Mobile Connectivity (iOS + Local Server)

## Read When
- You are working on iPhone/mobile connectivity.
- You need to understand pairing, discovery, or token auth behavior.
- You are debugging Windows + WSL + iPhone LAN issues.

## Overview

`codex-blocker` can now expose a mobile mode for LAN clients (the Expo iOS app):

- `npx codex-blocker --mobile`
- Defaults to binding on `0.0.0.0` in mobile mode.
- Publishes mDNS service `_codex-blocker._tcp`.
- Exposes mobile endpoints:
  - `GET /mobile/discovery`
  - `POST /mobile/pair/start`
  - `POST /mobile/pair/confirm`
- Existing auth-protected endpoints remain unchanged:
  - `GET /status`
  - `GET ws://<host>:8765/ws?token=<token>`

## End-to-End Flow

1. Server starts in mobile mode.
2. iPhone app discovers server over local network.
3. App calls `POST /mobile/pair/start` and receives a 6-digit code.
4. App immediately confirms code via `POST /mobile/pair/confirm`.
5. Server returns token + URLs.
6. App stores host/token and reconnects with:
   - `Authorization: Bearer <token>` for `/status`
   - `?token=<token>` for `/ws`
7. WebSocket delivers realtime state updates.

## Auth Model

- Extension bootstrap flow still works (origin-restricted token bootstrap).
- Mobile flow uses explicit one-time pairing code (TTL: 2 minutes).
- Once paired, mobile uses the same server token as other clients.

## Discovery Behavior (Current App)

The Expo app currently tries:

- Preferred previously-known host (if stored)
- `codex-blocker.local`
- Subnet scan based on phone IP (`x.y.z.1...254`) with concurrency

This is intentionally simple and LAN-first.

## Windows + WSL Networking Notes

### Why this can fail

In WSL NAT mode, server traffic may be reachable from Windows `localhost` but not directly from your phone on Wi-Fi.

Common symptom:

- Works on Windows:
  - `Invoke-RestMethod http://localhost:8765/mobile/discovery`
- Fails on iPhone:
  - `http://<windows-wifi-ip>:8765/mobile/discovery`

### Typical fix path

1. Keep server running in WSL with `--mobile`.
2. Add Windows `portproxy` from `0.0.0.0:8765 -> 127.0.0.1:8765`.
3. Add inbound firewall rule on the active network profile.
4. Confirm network profile (Public vs Private) matches firewall rule scope.

Example validation:

- `netsh interface portproxy show v4tov4`
- `Get-NetTCPConnection -State Listen -LocalPort 8765`
- `Invoke-RestMethod http://<windows-wifi-ip>:8765/mobile/discovery`

If Windows succeeds but iPhone fails, check:

- Firewall profile mismatch (Public network but Private-only rule).
- Router/client isolation mode (guest SSID, AP isolation).

## Troubleshooting Checklist

1. Server health from WSL:
   - `curl http://127.0.0.1:8765/mobile/discovery`
2. Windows local reachability:
   - `Invoke-RestMethod http://localhost:8765/mobile/discovery`
3. Windows LAN reachability:
   - `Invoke-RestMethod http://<windows-wifi-ip>:8765/mobile/discovery`
4. iPhone Safari reachability:
   - `http://<windows-wifi-ip>:8765/mobile/discovery`
5. App-level connectivity:
   - Start app with `pnpm dev:mobile` (tunnel + clear)
   - Verify phase transitions: `discovering -> pairing/connected`
