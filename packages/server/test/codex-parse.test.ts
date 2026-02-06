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

  it("parses user and legacy agent events", () => {
    const userLine = JSON.stringify({
      type: "event_msg",
      payload: { type: "user_message", cwd: "/tmp/project" },
    });
    const userParsed = parseCodexLine(userLine, "session-a");
    expect(userParsed.sessionId).toBe("session-a");
    expect(userParsed.cwd).toBe("/tmp/project");
    expect(userParsed.markWorking).toBe(true);
    expect(userParsed.markActivity).toBe(false);
    expect(userParsed.markWaitingForInput).toBe(false);
    expect(userParsed.markIdle).toBe(false);
    expect(userParsed.markLegacyIdleCandidate).toBe(false);

    const agentLine = JSON.stringify({
      type: "event_msg",
      payload: { type: "agent_message" },
    });
    const agentParsed = parseCodexLine(agentLine, "session-a");
    expect(agentParsed.markWorking).toBe(false);
    expect(agentParsed.markActivity).toBe(false);
    expect(agentParsed.markWaitingForInput).toBe(false);
    expect(agentParsed.markIdle).toBe(false);
    expect(agentParsed.markLegacyIdleCandidate).toBe(true);
  });

  it("treats response_item user messages as working activity", () => {
    const userLine = JSON.stringify({
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "run this command, go ahead" }],
      },
    });
    const parsed = parseCodexLine(userLine, "session-a");
    expect(parsed.markWorking).toBe(true);
    expect(parsed.markActivity).toBe(false);
    expect(parsed.markWaitingForInput).toBe(false);
    expect(parsed.markIdle).toBe(false);
    expect(parsed.markLegacyIdleCandidate).toBe(false);
  });

  it("ignores environment context response_item messages", () => {
    const envLine = JSON.stringify({
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: "<environment_context>\n  <cwd>/tmp</cwd>\n</environment_context>",
          },
        ],
      },
    });
    const parsed = parseCodexLine(envLine, "session-a");
    expect(parsed.markWorking).toBe(false);
    expect(parsed.markActivity).toBe(false);
    expect(parsed.markWaitingForInput).toBe(false);
    expect(parsed.markIdle).toBe(false);
    expect(parsed.markLegacyIdleCandidate).toBe(false);
  });

  it("treats commentary assistant messages as active and final answers as idle", () => {
    const commentaryLine = JSON.stringify({
      type: "response_item",
      payload: {
        type: "message",
        role: "assistant",
        phase: "commentary",
        content: [{ type: "output_text", text: "Working..." }],
      },
    });
    const commentaryParsed = parseCodexLine(commentaryLine, "session-a");
    expect(commentaryParsed.markWorking).toBe(false);
    expect(commentaryParsed.markActivity).toBe(true);
    expect(commentaryParsed.markWaitingForInput).toBe(false);
    expect(commentaryParsed.markIdle).toBe(false);
    expect(commentaryParsed.assistantMessagePhase).toBe("commentary");

    const finalLine = JSON.stringify({
      type: "response_item",
      payload: {
        type: "message",
        role: "assistant",
        phase: "final_answer",
        content: [{ type: "output_text", text: "Done." }],
      },
    });
    const finalParsed = parseCodexLine(finalLine, "session-a");
    expect(finalParsed.markWorking).toBe(false);
    expect(finalParsed.markActivity).toBe(false);
    expect(finalParsed.markWaitingForInput).toBe(false);
    expect(finalParsed.markIdle).toBe(true);
    expect(finalParsed.assistantMessagePhase).toBe("final_answer");
  });

  it("treats response/tool and reasoning events as active", () => {
    const functionCallLine = JSON.stringify({
      type: "response_item",
      payload: {
        type: "function_call",
        name: "exec_command",
      },
    });
    const functionCallParsed = parseCodexLine(functionCallLine, "session-a");
    expect(functionCallParsed.markActivity).toBe(true);
    expect(functionCallParsed.markWaitingForInput).toBe(false);
    expect(functionCallParsed.markIdle).toBe(false);

    const agentReasoningLine = JSON.stringify({
      type: "event_msg",
      payload: {
        type: "agent_reasoning",
      },
    });
    const agentReasoningParsed = parseCodexLine(agentReasoningLine, "session-a");
    expect(agentReasoningParsed.markActivity).toBe(true);
    expect(agentReasoningParsed.markWaitingForInput).toBe(false);
    expect(agentReasoningParsed.markIdle).toBe(false);
  });

  it("marks request_user_input function calls as waiting for input", () => {
    const line = JSON.stringify({
      type: "response_item",
      payload: {
        type: "function_call",
        name: "request_user_input",
      },
    });
    const parsed = parseCodexLine(line, "session-a");
    expect(parsed.markActivity).toBe(false);
    expect(parsed.markWaitingForInput).toBe(true);
    expect(parsed.markIdle).toBe(false);
  });

  it("treats item_completed as an idle boundary", () => {
    const line = JSON.stringify({
      type: "event_msg",
      payload: {
        type: "item_completed",
      },
    });
    const parsed = parseCodexLine(line, "session-a");
    expect(parsed.markIdle).toBe(true);
    expect(parsed.markWaitingForInput).toBe(false);
    expect(parsed.markLegacyIdleCandidate).toBe(false);
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
    expect(parsed.markActivity).toBe(false);
    expect(parsed.markWaitingForInput).toBe(false);
    expect(parsed.markIdle).toBe(false);
    expect(parsed.markLegacyIdleCandidate).toBe(false);
  });
});
