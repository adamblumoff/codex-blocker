# Release 0.1.0

Date: 2026-01-19

## Summary
This release standardizes the 0.1.0 version across packages and updates extension metadata.

## Highlights
- Extension title/description updated for store and UI surfaces.
- Extension and server packages bumped to 0.1.0.
- Popup and options page titles aligned with the new release title.

## Extension changes
- Manifest name/description/title updated to the new release wording.
- Version and version_name set to 0.1.0.

## Server changes
- Package description updated to match the new release wording.

## QA checklist
- Build extension (`pnpm --filter @codex-blocker/extension build`).
- Zip artifact generated (`pnpm --filter @codex-blocker/extension zip`).
- Confirm extension listing shows the new title/description.
