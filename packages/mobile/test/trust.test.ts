import { describe, expect, it } from "vitest";
import { shouldTrustDiscoveredInstance } from "../src/lib/trust";

describe("server trust pinning", () => {
  it("trusts first seen instance ids", () => {
    expect(shouldTrustDiscoveredInstance(null, "instance-a")).toBe(true);
  });

  it("trusts discovered servers that match the pinned instance id", () => {
    expect(shouldTrustDiscoveredInstance("instance-a", "instance-a")).toBe(true);
  });

  it("rejects discovered servers that do not match the pinned instance id", () => {
    expect(shouldTrustDiscoveredInstance("instance-a", "instance-b")).toBe(false);
  });
});
