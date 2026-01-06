import { describe, expect, it } from "vitest";
import {
  findFirstStringValue,
  isRolloutFile,
  parseCodexLine,
  sessionIdFromPath,
} from "../src/codex-parse.js";

describe("codex parsing helpers", () => {
  it("detects rollout files", () => {
    expect(isRolloutFile("/tmp/rollout.jsonl")).toBe(true);
    expect(isRolloutFile("/tmp/rollout-abc.jsonl")).toBe(true);
    expect(isRolloutFile("/tmp/rollout.txt")).toBe(false);
  });

  it("derives session ids from rollout paths", () => {
    expect(sessionIdFromPath("/sessions/abc/rollout.jsonl")).toBe("abc");
    expect(sessionIdFromPath("/sessions/rollout-xyz.jsonl")).toBe("xyz");
  });

  it("finds nested string values", () => {
    const value = findFirstStringValue(
      { payload: { metadata: { cwd: "/tmp/project" } } },
      ["cwd"]
    );
    expect(value).toBe("/tmp/project");
  });

  it("parses user and agent events", () => {
    const userLine = JSON.stringify({
      type: "event_msg",
      payload: { type: "user_message", cwd: "/tmp/project" },
    });
    const userParsed = parseCodexLine(userLine, "session-a");
    expect(userParsed.sessionId).toBe("session-a");
    expect(userParsed.cwd).toBe("/tmp/project");
    expect(userParsed.markWorking).toBe(true);
    expect(userParsed.markIdle).toBe(false);

    const agentLine = JSON.stringify({
      type: "event_msg",
      payload: { type: "agent_message" },
    });
    const agentParsed = parseCodexLine(agentLine, "session-a");
    expect(agentParsed.markWorking).toBe(false);
    expect(agentParsed.markIdle).toBe(true);
  });

  it("parses session id changes", () => {
    const line = JSON.stringify({
      type: "session_meta",
      payload: { id: "session-b" },
    });
    const parsed = parseCodexLine(line, "session-a");
    expect(parsed.sessionId).toBe("session-b");
    expect(parsed.previousSessionId).toBe("session-a");
  });

  it("handles malformed lines safely", () => {
    const parsed = parseCodexLine("{", "session-a");
    expect(parsed.sessionId).toBe("session-a");
    expect(parsed.markWorking).toBe(false);
    expect(parsed.markIdle).toBe(false);
  });
});
