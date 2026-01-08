import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { CodexSessionWatcher } from "../src/codex.js";
import { SessionState } from "../src/state.js";

describe("CodexSessionWatcher", () => {
  it("hydrates state from existing session logs on first scan", async () => {
    const dir = mkdtempSync(join(tmpdir(), "codex-blocker-"));
    const filePath = join(dir, "rollout-session-a.jsonl");
    const line = JSON.stringify({
      type: "event_msg",
      payload: { type: "user_message" },
    });
    writeFileSync(filePath, `${line}\n`, "utf-8");

    const state = new SessionState();
    const watcher = new CodexSessionWatcher(state, { sessionsDir: dir });

    await (watcher as { scan: () => Promise<void> }).scan();

    const status = state.getStatus();
    state.destroy();

    expect(status.sessions).toBe(1);
    expect(status.working).toBe(1);
    expect(status.blocked).toBe(false);
  });

  it("hydrates even when the user message is far from the end of the file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "codex-blocker-"));
    const filePath = join(dir, "rollout-session-b.jsonl");
    const userLine = JSON.stringify({
      type: "event_msg",
      payload: { type: "user_message" },
    });
    const filler = "x".repeat(200 * 1024);
    writeFileSync(filePath, `${userLine}\n${filler}\n`, "utf-8");

    const state = new SessionState();
    const watcher = new CodexSessionWatcher(state, { sessionsDir: dir });

    await (watcher as { scan: () => Promise<void> }).scan();

    const status = state.getStatus();
    state.destroy();

    expect(status.sessions).toBe(1);
    expect(status.working).toBe(1);
    expect(status.blocked).toBe(false);
  });
});
