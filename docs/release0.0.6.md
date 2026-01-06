# Release 0.0.6

Date: 2026-01-06

## Summary
This release focuses on tighter control over blocking behavior, better state sync, and media handling while blocked.

## Highlights
- Added "Always open" and "Always blocking" overrides with XOR behavior (both on falls back to default state).
- Added pause/resume media while blocked, including a user-gesture fallback for autoplay restrictions.
- Improved state delivery to content scripts with a persistent port connection.
- Server now gates blocking to user-message -> final assistant reply, ignoring tool-call noise.

## Extension changes
- Popup and Settings now include Always open + Always blocking toggles.
- Settings include Pause media toggle (default on).
- Block status UI reflects override state.
- Removed the `tabs` permission; state and domain updates now use runtime messaging only.

## Server changes
- Session activity now tracks turns based on user message start and agent message end.
- Disabled idle timeout transitions so blocking only changes on turn boundaries.

## Upgrade notes
- Extension version bumped to 0.0.6 in `packages/extension/manifest.json`.
- Server package already published at 0.0.6; extension should match.

## QA checklist (already verified)
- Toggle Always open/Always blocking individually and together (default behavior).
- Media pauses on block and resumes on unblock.
- Blocking starts on user prompt and ends on final assistant reply.
