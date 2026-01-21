import { describe, expect, it } from "vitest";
import { BASE_PHRASES, ROAST_PHRASES } from "../src/lib/phrases.js";
import { resolvePhraseSet, sanitizePhrases } from "../src/lib/phrase-storage.js";

describe("phrase storage helpers", () => {
  it("sanitizes phrases by trimming and removing empties/duplicates", () => {
    const result = sanitizePhrases(["  One  ", "", "Two", "Two", "   "]);
    expect(result).toEqual(["One", "Two"]);
  });

  it("falls back to defaults when storage is empty", () => {
    const resolved = resolvePhraseSet([], []);
    expect(resolved.base).toEqual(BASE_PHRASES);
    expect(resolved.roast).toEqual(ROAST_PHRASES);
  });

  it("uses stored phrases when provided", () => {
    const resolved = resolvePhraseSet(["Focus"], ["Roast"]);
    expect(resolved.base).toEqual(["Focus"]);
    expect(resolved.roast).toEqual(["Roast"]);
  });
});
