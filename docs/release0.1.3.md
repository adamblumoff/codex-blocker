# Release 0.1.3

## Summary
This patch keeps the real `0.1.2` Codex session detection and blocking fixes, while rolling the published server and extension behavior back to the simple pre-mobile flow.

## Changes
- Keep the `0.1.2` fixes for newer Codex CLI logs, including correct `commentary`, `final_answer`, tool-call, and `request_user_input` handling.
- Keep blocking while any session is `waiting_for_input`, unless an explicit bypass or force-open override is active.
- Restore the Chrome extension source to exactly match the `0.1.2` release build.
- Remove the 6-digit extension pairing flow from the active extension/server path.
- Remove mobile startup behavior from the normal `codex-blocker` CLI path, including mobile help text and mobile startup prompts.
- Restore the simple startup experience where the local server comes up and the extension auto-connects.
- Keep CI and release workflow files unchanged.

## Version bumps
- `codex-blocker` server package to `0.1.3`.
- Extension package + manifest to `0.1.3`.
