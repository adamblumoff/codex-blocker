import { describe, expect, it } from "vitest";
import { MobilePairingManager } from "../src/mobile.js";

describe("mobile pairing manager", () => {
  it("creates and confirms one-time pairing codes", () => {
    let now = 1_000;
    const pairing = new MobilePairingManager(() => {}, () => now);
    const created = pairing.startPairing();

    expect(created.code).toMatch(/^\d{6}$/);
    expect(created.qrNonce).toMatch(/^[a-f0-9]{32}$/);
    expect(created.qrExpiresAt).toBeGreaterThan(now);
    expect(created.expiresAt).toBeGreaterThan(now);
    expect(pairing.getStatus().active).toBe(true);

    expect(pairing.confirmPairingCode("000000")).toBe(false);
    expect(pairing.confirmPairingCode(created.code)).toBe(true);
    expect(pairing.getStatus().active).toBe(false);
    expect(pairing.confirmPairingCode(created.code)).toBe(false);
  });

  it("expires codes after TTL", () => {
    let now = 1_000;
    const pairing = new MobilePairingManager(() => {}, () => now);
    const created = pairing.startPairing();

    now = created.expiresAt + 1;
    expect(pairing.getStatus().active).toBe(false);
    expect(pairing.confirmPairingCode(created.code)).toBe(false);
  });

  it("reuses the active pairing code but refreshes qr nonce", () => {
    let now = 1_000;
    const pairing = new MobilePairingManager(() => {}, () => now);
    const first = pairing.startPairing();
    now = 1_001;
    const second = pairing.startPairing();

    expect(second.code).toBe(first.code);
    expect(second.expiresAt).toBe(first.expiresAt);
    expect(second.qrNonce).not.toBe(first.qrNonce);
    expect(second.qrExpiresAt).toBeGreaterThan(first.qrExpiresAt);

    now = first.expiresAt + 1;
    const third = pairing.startPairing();
    expect(third.code).not.toBe(first.code);
    expect(third.expiresAt).toBeGreaterThan(first.expiresAt);
  });

  it("rotates pairing code when regeneration is requested", () => {
    let now = 1_000;
    const pairing = new MobilePairingManager(() => {}, () => now);
    const first = pairing.startPairing();

    now = 1_050;
    const second = pairing.startPairing(true);
    expect(second.code).not.toBe(first.code);
    expect(second.expiresAt).toBeGreaterThan(first.expiresAt);
  });

  it("rejects expired qr nonce and accepts fresh qr nonce once", () => {
    let now = 1_000;
    const pairing = new MobilePairingManager(() => {}, () => now);
    const first = pairing.startPairing();

    now = first.qrExpiresAt + 1;
    expect(pairing.confirmPairingQrNonce(first.qrNonce)).toBe(false);

    const refreshed = pairing.startPairing();
    expect(pairing.confirmPairingQrNonce(refreshed.qrNonce)).toBe(true);
    expect(pairing.confirmPairingQrNonce(refreshed.qrNonce)).toBe(false);
  });
});
