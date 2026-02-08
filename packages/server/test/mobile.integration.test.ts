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

    for (let index = 0; index < 6; index += 1) {
      const res = await fetch(`http://127.0.0.1:${ctx.port}/mobile/pair/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qrNonce: "bad-nonce" }),
      });
      expect(res.status).toBe(401);
    }

    const lockedOut = await fetch(`http://127.0.0.1:${ctx.port}/mobile/pair/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qrNonce: "bad-nonce-two" }),
    });
    expect(lockedOut.status).toBe(429);
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
