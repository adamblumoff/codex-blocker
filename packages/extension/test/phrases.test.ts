import { describe, expect, it } from "vitest";

import { BASE_PHRASES, getPhrasesForMode, ROAST_PHRASES } from "../src/lib/phrases.js";

describe("phrases", () => {
  it("returns base phrases when roast mode is off", () => {
    expect(getPhrasesForMode(false)).toEqual(BASE_PHRASES);
  });

  it("returns roast phrases when roast mode is on", () => {
    expect(getPhrasesForMode(true)).toEqual(ROAST_PHRASES);
  });

  it("ships non-empty phrase lists", () => {
    expect(BASE_PHRASES.length).toBeGreaterThan(0);
    expect(ROAST_PHRASES.length).toBeGreaterThan(0);
  });
});
