# Release 0.1.1

## Summary
This release fixes Codex “steer” inputs being treated as idle, which caused the extension to keep blocking while the assistant was still working, and adds editable phrase lists in the options page.

## Changes
- Treat `response_item` user messages as activity (in addition to `event_msg` user messages) so steer inputs keep sessions in a working state.
- Added regression tests for steer input handling.
- Allow editing, adding, and deleting focus/roast phrases from the options page, with live updates after saving.
- Disable phrase rotation animation when only a single phrase exists for the active mode.
- Move the Tone section below Blocked Sites + Emergency Bypass and even out modal spacing.
- Version bump to 0.1.1 across server and extension metadata.
