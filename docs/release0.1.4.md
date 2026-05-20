# Release 0.1.4

## Summary
This release cleans up the server, extension, and mobile publishing surface while keeping the app behavior focused on blocking distractions unless Codex is actively working.

## Changes
- Block distracting sites when the server is connected but no Codex sessions are active.
- Wire the documented mobile CLI commands and options back into the server CLI.
- Keep extension authentication scoped to the browser session and limit token bootstrap to loopback Chrome extension connections.
- Reuse shared protocol request/response types from the shared package.
- Keep release docs aligned with the active CLI behavior.

## Version bumps
- `codex-blocker` server package to `0.1.4`.
- Extension package + manifest to `0.1.4`.
