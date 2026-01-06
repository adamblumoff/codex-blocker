# Shit To Do

## State Reliability
- Add a lightweight state re-sync in content scripts when "Always open" is toggled off but the state event is missed.
  - Option A: On tab visibility change, request GET_STATE once.
  - Option B: Periodic GET_STATE (e.g., every 20–30s) only on blocked domains.
  - Option C: Broadcast state on chrome.storage.onChanged in the service worker.

Observed: turning off Always open after a few minutes can keep pages open until the next state event.
