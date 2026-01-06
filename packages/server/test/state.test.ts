import { describe, expect, it } from "vitest";
import { SessionState } from "../src/state.js";

describe("SessionState", () => {
  it("broadcasts state on changes", () => {
    const state = new SessionState();
    const messages: Array<{ blocked: boolean; sessions: number; working: number }> = [];

    const unsubscribe = state.subscribe((message) => {
      if (message.type === "state") {
        messages.push({
          blocked: message.blocked,
          sessions: message.sessions,
          working: message.working,
        });
      }
    });

    state.handleCodexActivity({ sessionId: "session-a" });
    state.setCodexIdle("session-a");

    unsubscribe();
    state.destroy();

    expect(messages.length).toBeGreaterThanOrEqual(2);
    expect(messages[0]?.blocked).toBe(true);
    expect(messages[0]?.sessions).toBe(0);
    expect(messages[1]?.blocked).toBe(false);
    expect(messages[1]?.sessions).toBe(1);
    expect(messages[1]?.working).toBe(1);
  });
});
