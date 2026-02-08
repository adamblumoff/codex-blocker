import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import WebSocket from "ws";
import { MobilePairingManager } from "../src/mobile.js";
import { startServer } from "../src/server.js";
import { SessionState } from "../src/state.js";

type MobileContext = {
  handle: ReturnType<typeof startServer>;
  port: number;
  tempDir: string;
  state: SessionState;
  token: string;
  pairing: MobilePairingManager;
};

function waitForMessage(ws: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const onMessage = (data: WebSocket.RawData) => {
      cleanup();
      resolve(JSON.parse(data.toString()) as Record<string, unknown>);
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      ws.off("message", onMessage);
      ws.off("error", onError);
    };
    ws.on("message", onMessage);
    ws.on("error", onError);
  });
}

describe("mobile integration", () => {
  const ctx: Partial<MobileContext> = {};

  beforeAll(async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "codex-blocker-mobile-test-"));
    const state = new SessionState();
    const pairing = new MobilePairingManager(() => {});
    const handle = startServer(0, {
      startWatcher: false,
      state,
      mobile: true,
      publishMdns: false,
      log: false,
      mobilePairingManager: pairing,
    });
    const port = await handle.ready;
    Object.assign(ctx, { handle, port, tempDir, state, pairing });
  });

  afterAll(async () => {
    if (ctx.handle) {
      await ctx.handle.close();
    }
    if (ctx.tempDir) {
      await rm(ctx.tempDir, { recursive: true, force: true });
    }
  });

  it("supports discovery and pairing", async () => {
    const discoveryRes = await fetch(`http://127.0.0.1:${ctx.port}/mobile/discovery`);
    expect(discoveryRes.status).toBe(200);
    const discovery = (await discoveryRes.json()) as Record<string, unknown>;
    expect(discovery.name).toBe("Codex Blocker");
    expect(discovery.pairingRequired).toBe(true);

    const startRes = await fetch(`http://127.0.0.1:${ctx.port}/mobile/pair/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(startRes.status).toBe(200);
    const startPayload = (await startRes.json()) as Record<string, unknown>;
    expect(startPayload.code).toBeUndefined();
    expect(typeof startPayload.expiresAt).toBe("number");
    expect(typeof startPayload.qrExpiresAt).toBe("number");
    expect(startPayload.qrFormat).toBe("cbm-v1");

    const badConfirmRes = await fetch(`http://127.0.0.1:${ctx.port}/mobile/pair/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qrNonce: "not-a-real-nonce" }),
    });
    expect(badConfirmRes.status).toBe(401);

    const confirmRes = await fetch(`http://127.0.0.1:${ctx.port}/mobile/pair/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qrNonce: ctx.pairing?.startPairing().qrNonce }),
    });
    expect(confirmRes.status).toBe(200);
    const confirmPayload = (await confirmRes.json()) as Record<string, unknown>;
    expect(typeof confirmPayload.token).toBe("string");
    ctx.token = confirmPayload.token as string;
  });

  it("keeps the current qr nonce when refreshQr is disabled", async () => {
    const existingPairing = ctx.pairing?.startPairing();
    expect(existingPairing).toBeTruthy();

    const startRes = await fetch(`http://127.0.0.1:${ctx.port}/mobile/pair/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshQr: false }),
    });
    expect(startRes.status).toBe(200);
    const startPayload = (await startRes.json()) as Record<string, unknown>;
    expect(startPayload.expiresAt).toBe(existingPairing?.expiresAt);
    expect(startPayload.qrExpiresAt).toBe(existingPairing?.qrExpiresAt);

    const confirmRes = await fetch(`http://127.0.0.1:${ctx.port}/mobile/pair/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qrNonce: existingPairing?.qrNonce }),
    });
    expect(confirmRes.status).toBe(200);
    const confirmPayload = (await confirmRes.json()) as Record<string, unknown>;
    expect(typeof confirmPayload.token).toBe("string");
    ctx.token = confirmPayload.token as string;
  });

  it("regenerates terminal code when regenerateCode is requested", async () => {
    const first = ctx.pairing?.startPairing().code;
    expect(typeof first).toBe("string");

    const regen = await fetch(`http://127.0.0.1:${ctx.port}/mobile/pair/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ regenerateCode: true }),
    });
    expect(regen.status).toBe(200);

    const staleConfirm = await fetch(`http://127.0.0.1:${ctx.port}/mobile/pair/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: first }),
    });
    expect(staleConfirm.status).toBe(401);
  });

  it("rejects invalid confirm payload shape", async () => {
    const missing = await fetch(`http://127.0.0.1:${ctx.port}/mobile/pair/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(missing.status).toBe(400);

    const both = await fetch(`http://127.0.0.1:${ctx.port}/mobile/pair/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "123456", qrNonce: "abc" }),
    });
    expect(both.status).toBe(400);
  });

  it("locks out repeated invalid pairing attempts", async () => {
    await fetch(`http://127.0.0.1:${ctx.port}/mobile/pair/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    let sawUnauthorized = false;
    let lockedOut: Response | null = null;

    for (let index = 0; index < 8; index += 1) {
      const res = await fetch(`http://127.0.0.1:${ctx.port}/mobile/pair/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qrNonce: "bad-nonce" }),
      });
      if (res.status === 401) {
        sawUnauthorized = true;
        continue;
      }
      if (res.status === 429) {
        lockedOut = res;
        break;
      }
      throw new Error(`Unexpected status while probing lockout: ${res.status}`);
    }

    expect(sawUnauthorized).toBe(true);
    expect(lockedOut?.status).toBe(429);
    const lockedOutPayload = (await lockedOut?.json()) as Record<string, unknown>;
    expect(lockedOutPayload.error).toBe("Too Many Requests");
    expect(lockedOutPayload.code).toBe("pair_confirm_locked");
    expect(typeof lockedOutPayload.retryAfterMs).toBe("number");
    expect(Number(lockedOutPayload.retryAfterMs)).toBeGreaterThan(0);
  });

  it("accepts paired token for status and websocket", async () => {
    const statusRes = await fetch(`http://127.0.0.1:${ctx.port}/status`, {
      headers: { Authorization: `Bearer ${ctx.token}` },
    });
    expect(statusRes.status).toBe(200);

    const ws = new WebSocket(`ws://127.0.0.1:${ctx.port}/ws?token=${ctx.token}`);
    const initialPromise = waitForMessage(ws);

    await new Promise<void>((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });

    const initial = await initialPromise;
    expect(initial.type).toBe("state");

    const updatePromise = waitForMessage(ws);
    ctx.state?.handleCodexActivity({ sessionId: "mobile-session" });
    const update = await updatePromise;
    expect(update.working).toBe(1);

    await new Promise<void>((resolve) => {
      ws.once("close", resolve);
      ws.close();
    });
  });
});
