import { describe, expect, it } from "vitest";
import { MobilePairingManager } from "../src/mobile.js";

describe("mobile pairing manager", () => {
  it("creates and confirms one-time pairing codes", () => {
    let now = 1_000;
    const pairing = new MobilePairingManager(() => {}, () => now);
    const created = pairing.startPairing();

    expect(created.code).toMatch(/^\d{6}$/);
    expect(created.expiresAt).toBeGreaterThan(now);
    expect(pairing.getStatus().active).toBe(true);

    expect(pairing.confirmPairing("000000")).toBe(false);
    expect(pairing.confirmPairing(created.code)).toBe(true);
    expect(pairing.getStatus().active).toBe(false);
    expect(pairing.confirmPairing(created.code)).toBe(false);
  });

  it("expires codes after TTL", () => {
    let now = 1_000;
    const pairing = new MobilePairingManager(() => {}, () => now);
    const created = pairing.startPairing();

    now = created.expiresAt + 1;
    expect(pairing.getStatus().active).toBe(false);
    expect(pairing.confirmPairing(created.code)).toBe(false);
  });

  it("reuses the active pairing code until it expires", () => {
    let now = 1_000;
    const pairing = new MobilePairingManager(() => {}, () => now);
    const first = pairing.startPairing();
    const second = pairing.startPairing();

    expect(second.code).toBe(first.code);
    expect(second.expiresAt).toBe(first.expiresAt);

    now = first.expiresAt + 1;
    const third = pairing.startPairing();
    expect(third.code).not.toBe(first.code);
    expect(third.expiresAt).toBeGreaterThan(first.expiresAt);
  });
});
