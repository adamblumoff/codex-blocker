import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { startServer } from "../src/server.js";
import { SessionState } from "../src/state.js";
import { MobilePairingManager } from "../src/mobile.js";

type SessionAuthContext = {
  tempDir: string;
  state: SessionState;
  handle: ReturnType<typeof startServer>;
  port: number;
  pairing: MobilePairingManager;
};

async function startSessionServer(
  tempDir: string,
  state: SessionState
): Promise<Pick<SessionAuthContext, "handle" | "port" | "pairing">> {
  const pairing = new MobilePairingManager(() => {});
  const handle = startServer(0, {
    state,
    startWatcher: false,
    publishMdns: false,
    log: false,
    mobilePairingManager: pairing,
  });
  const port = await handle.ready;
  return { handle, port, pairing };
}

describe("session-scoped auth", () => {
  const ctx: Partial<SessionAuthContext> = {};

  beforeAll(async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "codex-blocker-session-auth-"));
    const state = new SessionState();
    const initial = await startSessionServer(tempDir, state);
    Object.assign(ctx, { tempDir, state, ...initial });
  });

  afterAll(async () => {
    if (ctx.handle) {
      await ctx.handle.close();
    }
    if (ctx.tempDir) {
      await rm(ctx.tempDir, { recursive: true, force: true });
    }
  });

  it("requires pairing before accepting authenticated status requests", async () => {
    const unauthenticated = await fetch(
      `http://127.0.0.1:${ctx.port}/status`,
      {
        headers: {
          Authorization: "Bearer attacker-token",
          Origin: "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
      }
    );
    expect(unauthenticated.status).toBe(401);
  });

  it("invalidates old tokens after a server restart", async () => {
    await fetch(`http://127.0.0.1:${ctx.port}/mobile/pair/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const tokenResponse = await fetch(
      `http://127.0.0.1:${ctx.port}/mobile/pair/confirm`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: ctx.pairing?.startPairing().code }),
      }
    );
    expect(tokenResponse.status).toBe(200);
    const firstToken = ((await tokenResponse.json()) as { token: string }).token;

    await ctx.handle?.close();

    const restarted = await startSessionServer(ctx.tempDir!, ctx.state!);
    ctx.handle = restarted.handle;
    ctx.port = restarted.port;
    ctx.pairing = restarted.pairing;

    const staleTokenStatus = await fetch(
      `http://127.0.0.1:${ctx.port}/status`,
      {
        headers: { Authorization: `Bearer ${firstToken}` },
      }
    );
    expect(staleTokenStatus.status).toBe(401);
  });
});
