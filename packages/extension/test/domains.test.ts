import { describe, expect, it } from "vitest";
import { isValidDomain, normalizeDomain } from "../src/lib/domains.js";

describe("domains", () => {
  it("normalizes input to a bare domain", () => {
    expect(normalizeDomain("https://www.Example.com/path")).toBe("example.com");
    expect(normalizeDomain("http://sub.example.com/foo/bar")).toBe("sub.example.com");
    expect(normalizeDomain("  example.com ")).toBe("example.com");
  });

  it("validates domains conservatively", () => {
    expect(isValidDomain("example.com")).toBe(true);
    expect(isValidDomain("foo.bar")).toBe(true);
    expect(isValidDomain("x.com")).toBe(true);
    expect(isValidDomain("localhost")).toBe(false);
    expect(isValidDomain("example")).toBe(false);
  });
});
