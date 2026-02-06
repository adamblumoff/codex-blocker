import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it, vi } from "vitest";
import { CodexSessionWatcher } from "../src/codex.js";
import { SessionState } from "../src/state.js";

function appendJsonLines(filePath: string, lines: unknown[]): void {
  const content = lines.map((line) => `${JSON.stringify(line)}\n`).join("");
  appendFileSync(filePath, content, "utf-8");
}

async function scanWatcher(watcher: CodexSessionWatcher): Promise<void> {
  await (watcher as unknown as { scan: () => Promise<void> }).scan();
}

describe("CodexSessionWatcher", () => {
  it("stays working for commentary/tool activity and idles only on final_answer", async () => {
    const sessionsDir = mkdtempSync(join(tmpdir(), "codex-blocker-watch-"));
    const rolloutPath = join(sessionsDir, "rollout-session-a.jsonl");
    writeFileSync(rolloutPath, "", "utf-8");

    const state = new SessionState();
    const watcher = new CodexSessionWatcher(state, { sessionsDir });

    try {
      await scanWatcher(watcher);
      appendJsonLines(rolloutPath, [
        { type: "event_msg", payload: { type: "user_message" } },
        { type: "event_msg", payload: { type: "agent_message" } },
        {
          type: "response_item",
          payload: {
            type: "message",
            role: "assistant",
            phase: "commentary",
            content: [{ type: "output_text", text: "working" }],
          },
        },
        { type: "response_item", payload: { type: "function_call", name: "exec_command" } },
        { type: "response_item", payload: { type: "function_call_output", output: "ok" } },
      ]);
      await scanWatcher(watcher);

      let status = state.getStatus();
      expect(status.working).toBe(1);
      expect(status.blocked).toBe(false);

      appendJsonLines(rolloutPath, [
        { type: "event_msg", payload: { type: "agent_message" } },
        {
          type: "response_item",
          payload: {
            type: "message",
            role: "assistant",
            phase: "final_answer",
            content: [{ type: "output_text", text: "done" }],
          },
        },
      ]);
      await scanWatcher(watcher);

      status = state.getStatus();
      expect(status.working).toBe(0);
      expect(status.blocked).toBe(true);
    } finally {
      state.destroy();
      rmSync(sessionsDir, { recursive: true, force: true });
    }
  });

  it("transitions to waiting_for_input on request_user_input and resumes on user activity", async () => {
    const sessionsDir = mkdtempSync(join(tmpdir(), "codex-blocker-watch-"));
    const rolloutPath = join(sessionsDir, "rollout-session-wait.jsonl");
    writeFileSync(rolloutPath, "", "utf-8");

    const state = new SessionState();
    const watcher = new CodexSessionWatcher(state, { sessionsDir });

    try {
      await scanWatcher(watcher);
      appendJsonLines(rolloutPath, [
        { type: "event_msg", payload: { type: "user_message" } },
        {
          type: "response_item",
          payload: { type: "function_call", name: "request_user_input" },
        },
      ]);
      await scanWatcher(watcher);

      let status = state.getStatus();
      expect(status.working).toBe(0);
      expect(status.waitingForInput).toBe(1);
      expect(status.blocked).toBe(true);

      appendJsonLines(rolloutPath, [{ type: "event_msg", payload: { type: "user_message" } }]);
      await scanWatcher(watcher);

      status = state.getStatus();
      expect(status.working).toBe(1);
      expect(status.waitingForInput).toBe(0);
      expect(status.blocked).toBe(false);

      appendJsonLines(rolloutPath, [
        {
          type: "response_item",
          payload: {
            type: "message",
            role: "assistant",
            phase: "final_answer",
            content: [{ type: "output_text", text: "done" }],
          },
        },
      ]);
      await scanWatcher(watcher);

      status = state.getStatus();
      expect(status.working).toBe(0);
      expect(status.waitingForInput).toBe(0);
      expect(status.blocked).toBe(true);
    } finally {
      state.destroy();
      rmSync(sessionsDir, { recursive: true, force: true });
    }
  });

  it("uses legacy agent_message fallback after a grace period", async () => {
    const sessionsDir = mkdtempSync(join(tmpdir(), "codex-blocker-watch-"));
    const rolloutPath = join(sessionsDir, "rollout-session-b.jsonl");
    writeFileSync(rolloutPath, "", "utf-8");

    const state = new SessionState();
    const watcher = new CodexSessionWatcher(state, { sessionsDir });

    let now = 1_000;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => now);

    try {
      await scanWatcher(watcher);
      appendJsonLines(rolloutPath, [
        { type: "event_msg", payload: { type: "user_message" } },
        { type: "event_msg", payload: { type: "agent_message" } },
      ]);
      await scanWatcher(watcher);

      let status = state.getStatus();
      expect(status.working).toBe(1);
      expect(status.blocked).toBe(false);

      now += 5_000;
      await scanWatcher(watcher);

      status = state.getStatus();
      expect(status.working).toBe(0);
      expect(status.blocked).toBe(true);
    } finally {
      nowSpy.mockRestore();
      state.destroy();
      rmSync(sessionsDir, { recursive: true, force: true });
    }
  });
});
