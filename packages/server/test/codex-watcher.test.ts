import { describe, expect, it } from "vitest";
import { isSessionFileRecent } from "../src/codex.js";
import { SESSION_TIMEOUT_MS } from "../src/types.js";

describe("codex session watcher", () => {
  it("skips old session files", () => {
    const now = Date.now();
    expect(isSessionFileRecent({ mtimeMs: now }, now)).toBe(true);
    expect(isSessionFileRecent({ mtimeMs: now - SESSION_TIMEOUT_MS }, now)).toBe(
      true
    );
    expect(
      isSessionFileRecent({ mtimeMs: now - SESSION_TIMEOUT_MS - 1 }, now)
    ).toBe(false);
  });
});
