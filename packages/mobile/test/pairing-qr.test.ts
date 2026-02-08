import { describe, expect, it } from "vitest";
import { parsePairingQrPayload } from "../src/lib/pairing-qr";

describe("parsePairingQrPayload", () => {
  it("parses a valid pairing payload", () => {
    const result = parsePairingQrPayload(
      "CBM1;h=codex-blocker.local;p=8765;i=instance-1;n=nonce-abc;e=1730000000000"
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.host).toBe("codex-blocker.local");
    expect(result.payload.port).toBe(8765);
    expect(result.payload.instanceId).toBe("instance-1");
    expect(result.payload.qrNonce).toBe("nonce-abc");
    expect(result.payload.expiresAt).toBe(1_730_000_000_000);
  });

  it("rejects non-codex qr payloads", () => {
    const result = parsePairingQrPayload("https://example.com");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("not a Codex Blocker pairing code");
  });

  it("rejects missing fields", () => {
    const result = parsePairingQrPayload("CBM1;h=host;p=8765;i=;n=nonce;e=10");
    expect(result.ok).toBe(false);
  });

  it("rejects invalid port and expiry", () => {
    const badPort = parsePairingQrPayload("CBM1;h=host;p=70000;i=id;n=nonce;e=10");
    const badExpiry = parsePairingQrPayload("CBM1;h=host;p=8765;i=id;n=nonce;e=0");
    expect(badPort.ok).toBe(false);
    expect(badExpiry.ok).toBe(false);
  });
});
