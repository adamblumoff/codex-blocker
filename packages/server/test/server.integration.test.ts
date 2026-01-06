import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import WebSocket from "ws";
import { startServer } from "../src/server.js";
import { SessionState } from "../src/state.js";

type ServerContext = {
  handle: ReturnType<typeof startServer>;
  port: number;
  token: string;
  tempDir: string;
  state: SessionState;
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

describe("server integration", () => {
  const ctx: Partial<ServerContext> = {};

  beforeAll(async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "codex-blocker-test-"));
    const token = "test-token";
    const state = new SessionState();
    const handle = startServer(0, {
      tokenPath: join(tempDir, "token"),
      startWatcher: false,
      state,
      log: false,
    });
    const port = await handle.ready;
    Object.assign(ctx, { handle, port, token, tempDir, state });
  });

  afterAll(async () => {
    if (ctx.handle) {
      await ctx.handle.close();
    }
    if (ctx.tempDir) {
      await rm(ctx.tempDir, { recursive: true, force: true });
    }
  });

  it("requires auth for status", async () => {
    const res = await fetch(`http://127.0.0.1:${ctx.port}/status`);
    expect(res.status).toBe(401);
  });

  it("accepts token with extension origin and returns status", async () => {
    const res = await fetch(`http://127.0.0.1:${ctx.port}/status`, {
      headers: {
        Authorization: `Bearer ${ctx.token}`,
        Origin: "chrome-extension://test",
      },
    });
    expect(res.status).toBe(200);
    const payload = (await res.json()) as Record<string, unknown>;
    expect(payload.blocked).toBe(true);
  });

  it("broadcasts state updates over WebSocket", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${ctx.port}/ws?token=${ctx.token}`, {
      headers: { origin: "chrome-extension://test" },
    });

    const initialPromise = waitForMessage(ws);

    await new Promise<void>((resolve, reject) => {
      ws.on("open", () => resolve());
      ws.on("error", reject);
    });

    const initial = await initialPromise;
    expect(initial.type).toBe("state");

    const updatedPromise = waitForMessage(ws);
    ctx.state?.handleCodexActivity({ sessionId: "session-a" });
    const updated = await updatedPromise;
    expect(updated.type).toBe("state");
    expect(updated.working).toBe(1);

    await new Promise<void>((resolve) => {
      ws.once("close", () => resolve());
      ws.close();
    });
  });
});
