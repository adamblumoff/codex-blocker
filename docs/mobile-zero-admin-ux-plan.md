# Zero-Admin Mobile UX Plan

## Read When
- You want to remove manual admin commands for mobile setup.
- You are planning onboarding and local-network UX for Windows users.
- You are deciding between local-only and relay fallback architecture.

## Goal

Mobile setup should be one-click from the user perspective, without requiring users to manually run PowerShell admin commands.

## Current Problem

For some Windows + WSL environments:

- Server is reachable at `localhost`, but not on LAN.
- iPhone cannot reach server without `portproxy` + firewall changes.
- This creates a high-friction setup path.

## Constraints

- Keep existing server activity logic unchanged.
- Keep local-first behavior for privacy and low latency.
- Support iOS users who are not technical.

## Recommended Strategy

Use a three-layer approach:

1. Local-first auto setup (best case, no user terminal work).
2. Guided elevation when required (one click, not copy-paste commands).
3. Relay fallback when local networking cannot be opened.

## Phase 1: Auto Setup Assistant (Local-only)

Add `codex-blocker mobile:doctor` and `codex-blocker mobile:fix`.

### `mobile:doctor`
- Detect OS, WSL mode, bind host, active interfaces, firewall profile.
- Check endpoints from local and LAN context.
- Output machine-readable diagnostics (JSON + human summary).

### `mobile:fix`
- On Windows hosts:
  - Create/repair `portproxy` rules.
  - Create/repair firewall rule for correct profile.
- On WSL:
  - Invoke Windows helper automatically.
- Use idempotent operations and clear success/failure output.

Acceptance criteria:

- Running `mobile:fix` twice is safe and produces stable output.
- 90%+ of standard home network setups connect without manual commands.

## Phase 2: Guided UX in App and Server

### Server UX
- On `--mobile` startup, print:
  - detected LAN status
  - whether mobile should work now
  - exact next step (`mobile:fix`) if not
- Add `GET /mobile/diagnostics` for app-readable status.

### Mobile App UX
- Add setup wizard states:
  - `checking-local-network`
  - `needs-host-fix`
  - `ready-to-pair`
  - `connected`
- If host setup is required:
  - show one button to open local setup URL/command
  - show plain-language explanation, not networking jargon

Acceptance criteria:

- User can complete setup from the app UI and one host action.
- No manual command copy/paste required in normal flows.

## Phase 3: Relay Fallback (No LAN Admin Path)

When local exposure fails or is blocked:

- Host opens outbound websocket to relay.
- Mobile app connects to relay with same auth identity.
- Pairing remains explicit and user-controlled.

Benefits:

- No LAN/firewall configuration required.
- Works on locked-down networks.

Tradeoff:

- Adds hosted service and external dependency.

Acceptance criteria:

- User can connect mobile app even when LAN route is unavailable.
- App clearly indicates `Local` vs `Relay` mode.

## Security Requirements

- Pairing codes remain short-lived and one-time.
- Tokens are stored securely on device.
- `mobile:fix` only opens required port and scope.
- Public-profile firewall rules should default to `LocalSubnet`.

## Implementation Sequence

1. Build `mobile:doctor` first (visibility).
2. Build `mobile:fix` second (automation).
3. Add setup wizard states in app.
4. Add optional relay fallback.

## Success Metrics

- Median time from app open to connected state.
- Setup success rate on first attempt.
- Percentage of users requiring manual terminal commands.
- Drop-off rate during pairing.
