import { describe, expect, it } from "vitest";
import { applyOverrides, computeShouldBlock } from "../src/lib/blocking.js";

describe("blocking", () => {
  it("blocks when server is offline and no bypass is active", () => {
    const shouldBlock = computeShouldBlock({
      bypassActive: false,
      serverConnected: false,
      sessions: 0,
      working: 0,
      waitingForInput: 0,
    });
    expect(shouldBlock).toBe(true);
  });

  it("does not block when active sessions are working", () => {
    const shouldBlock = computeShouldBlock({
      bypassActive: false,
      serverConnected: true,
      sessions: 1,
      working: 1,
      waitingForInput: 0,
    });
    expect(shouldBlock).toBe(false);
  });

  it("blocks when sessions are idle", () => {
    const shouldBlock = computeShouldBlock({
      bypassActive: false,
      serverConnected: true,
      sessions: 2,
      working: 0,
      waitingForInput: 0,
    });
    expect(shouldBlock).toBe(true);
  });

  it("respects bypass", () => {
    const shouldBlock = computeShouldBlock({
      bypassActive: true,
      serverConnected: true,
      sessions: 2,
      working: 0,
      waitingForInput: 0,
    });
    expect(shouldBlock).toBe(false);
  });

  it("applies overrides with XOR behavior", () => {
    expect(applyOverrides(true, true, false)).toBe(false);
    expect(applyOverrides(false, false, true)).toBe(true);
    expect(applyOverrides(true, true, true)).toBe(true);
    expect(applyOverrides(false, true, true)).toBe(false);
  });
});
