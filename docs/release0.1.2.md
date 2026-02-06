# Release 0.1.2

## Summary
This patch fixes false mid-turn `idle` transitions introduced by newer Codex CLI logs (observed with Codex CLI `0.98.0`) where assistant commentary messages are emitted before the turn is actually complete.

## Changes
- Treat `response_item` assistant messages with `phase: "final_answer"` as the primary idle boundary.
- Treat `response_item` assistant messages with `phase: "commentary"` as active work, not idle.
- Treat `response_item.function_call` with `name: "request_user_input"` as a `waiting_for_input` boundary so Plan Mode questions are detected immediately.
- Treat `agent_reasoning`, `reasoning`, `function_call`, `function_call_output`, `custom_tool_call`, and `custom_tool_call_output` as activity signals so sessions remain `working` during tool loops.
- Add support for `event_msg.item_completed` as an explicit idle boundary when present.
- Block while any session is `waiting_for_input` (including mixed states where another session is still `working`), unless an explicit bypass/force-open override is active.
- For Plan Mode `request_user_input`, use the same full blocking modal as other blocked states (removed separate question toast/notification path).
- Keep backward compatibility for older Codex logs by using `event_msg.agent_message` as a delayed fallback idle signal when modern phase signals are absent.
- Fix Chrome Web Store CI upload requests by using the explicit media upload protocol (`uploadType=media`) and add clearer upload error payload logging for easier debugging.
- Add regression tests for:
  - Codex CLI `0.98.0`-style commentary + tool-call turns.
  - Plan Mode `request_user_input` turns and waiting-state transitions.
  - Legacy `agent_message`-only idle detection behavior.

## Version bumps
- `codex-blocker` server package to `0.1.2`.
- Extension package + manifest to `0.1.2`.
