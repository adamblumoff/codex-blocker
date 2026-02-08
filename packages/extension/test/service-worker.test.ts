import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("service worker", () => {
  let messageListener: ((message: any, sender: any, sendResponse: (resp: any) => void) => boolean) | null =
    null;
  let connectListener: ((port: any) => void) | null = null;
  const syncData: Record<string, unknown> = {};
  const localData: Record<string, unknown> = {};
  const sessionData: Record<string, unknown> = {};
  const sendMessageSpy = vi.fn(() => Promise.resolve());
  const fetchSpy = vi.fn();

  class FakeWebSocket {
    static OPEN = 1;
    static CONNECTING = 0;
    static latest: FakeWebSocket | null = null;
    static latestProtocols: string[] | undefined;
    readyState = FakeWebSocket.CONNECTING;
    onopen?: () => void;
    onmessage?: (event: { data: string }) => void;
    onclose?: (event: { code: number }) => void;
    onerror?: () => void;
    url: string;
    constructor(url: string, protocols?: string | string[]) {
      this.url = url;
      FakeWebSocket.latest = this;
      FakeWebSocket.latestProtocols = Array.isArray(protocols)
        ? protocols
        : protocols
          ? [protocols]
          : undefined;
      setTimeout(() => {
        this.readyState = FakeWebSocket.OPEN;
        this.onopen?.();
      }, 0);
    }
    send(_data: string) {}
    closeWithCode(code: number) {
      this.readyState = 3;
      this.onclose?.({ code });
    }
  }

  async function sendRuntimeMessage(message: any): Promise<any> {
    return new Promise((resolve) => {
      messageListener?.(message, null, (response: any) => resolve(response));
    });
  }

  async function waitForState(
    predicate: (state: any) => boolean,
    attempts = 6
  ): Promise<any> {
    for (let index = 0; index < attempts; index += 1) {
      const state = await sendRuntimeMessage({ type: "GET_STATE" });
      if (predicate(state)) {
        return state;
      }
      await Promise.resolve();
    }
    return sendRuntimeMessage({ type: "GET_STATE" });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    Object.keys(syncData).forEach((key) => delete syncData[key]);
    Object.keys(localData).forEach((key) => delete localData[key]);
    Object.keys(sessionData).forEach((key) => delete sessionData[key]);
    Object.assign(syncData, {
      bypassUntil: Date.now() + 5_000,
      pauseMedia: false,
      forceBlock: false,
      forceOpen: false,
    });

    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    fetchSpy.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/mobile/pair/start")) {
        return {
          ok: true,
          json: async () => ({ expiresAt: Date.now() + 120_000 }),
        } as Response;
      }

      if (url.endsWith("/mobile/pair/confirm")) {
        const parsed = JSON.parse((init?.body as string) ?? "{}");
        if (parsed.code === "123456") {
          return {
            ok: true,
            json: async () => ({
              token: "paired-token",
              statusUrl: "http://localhost:8765/status",
              wsUrl: "ws://localhost:8765/ws",
            }),
          } as Response;
        }
        return {
          ok: false,
          status: 401,
          statusText: "Unauthorized",
          json: async () => ({ error: "Invalid code" }),
        } as Response;
      }

      return {
        ok: false,
        status: 404,
        statusText: "Not Found",
      } as Response;
    });

    globalThis.chrome = {
      runtime: {
        onMessage: {
          addListener: (listener: any) => {
            messageListener = listener;
          },
        },
        onConnect: {
          addListener: (listener: any) => {
            connectListener = listener;
          },
        },
        sendMessage: sendMessageSpy,
      },
      storage: {
        sync: {
          get: (_keys: string[], callback: (result: any) => void) => {
            callback({ ...syncData });
          },
          set: vi.fn((data: Record<string, unknown>, callback?: () => void) => {
            Object.assign(syncData, data);
            callback?.();
          }),
          remove: vi.fn((_key: string, callback?: () => void) => {
            callback?.();
          }),
        },
        local: {
          get: (_keys: string[], callback: (result: any) => void) => {
            callback({ ...localData });
          },
          set: vi.fn((data: Record<string, unknown>, callback?: () => void) => {
            Object.assign(localData, data);
            callback?.();
          }),
        },
        session: {
          get: (_keys: string[], callback: (result: any) => void) => {
            callback({ ...sessionData });
          },
          set: vi.fn((data: Record<string, unknown>, callback?: () => void) => {
            Object.assign(sessionData, data);
            callback?.();
          }),
          remove: vi.fn((key: string, callback?: () => void) => {
            delete sessionData[key];
            callback?.();
          }),
        },
      },
    } as unknown as typeof chrome;
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.resetModules();
    delete (globalThis as { chrome?: unknown }).chrome;
    delete (globalThis as { WebSocket?: unknown }).WebSocket;
    delete (globalThis as { fetch?: unknown }).fetch;
    fetchSpy.mockReset();
  });

  it("requires code pairing when no session token exists and connects after confirm", async () => {
    await import("../src/service-worker.js");

    vi.runOnlyPendingTimers();
    await Promise.resolve();

    const initialStartCall = fetchSpy.mock.calls.find(
      (call) => String(call[0]).endsWith("/mobile/pair/start")
    );
    expect(initialStartCall).toBeDefined();
    const initialStartInit = initialStartCall?.[1] as RequestInit;
    expect(JSON.parse(String(initialStartInit.body))).toEqual({ refreshQr: false });

    const initialState = await sendRuntimeMessage({ type: "GET_STATE" });
    expect(initialState.pairingRequired).toBe(true);
    expect(initialState.connectionPhase).toBe("pairing");

    const port = {
      name: "state",
      postMessage: vi.fn(),
      onMessage: { addListener: vi.fn() },
      onDisconnect: { addListener: vi.fn() },
    };
    connectListener?.(port);

    const pairResponse = await sendRuntimeMessage({
      type: "CONFIRM_PAIRING",
      code: "123456",
    });

    vi.runOnlyPendingTimers();
    await Promise.resolve();

    expect(pairResponse).toEqual({ success: true });
    expect(FakeWebSocket.latestProtocols).toContain("codex-blocker-token.paired-token");

    const connectedState = await sendRuntimeMessage({ type: "GET_STATE" });
    expect(connectedState.pairingRequired).toBe(false);
    expect(connectedState.connectionPhase).toBe("connected");
    expect(sendMessageSpy).toHaveBeenCalled();
  });

  it("clears session token and re-enters pairing when websocket auth is rejected", async () => {
    sessionData.sessionAuthToken = "stale-token";

    await import("../src/service-worker.js");
    vi.runOnlyPendingTimers();
    await Promise.resolve();

    expect(FakeWebSocket.latestProtocols).toContain("codex-blocker-token.stale-token");

    FakeWebSocket.latest?.closeWithCode(1008);
    await Promise.resolve();

    const stateAfterReject = await waitForState(
      (state) => state?.pairingRequired === true && state?.connectionPhase === "pairing"
    );
    expect(stateAfterReject.pairingRequired).toBe(true);
    expect(stateAfterReject.connectionPhase).toBe("pairing");
    expect(sessionData.sessionAuthToken).toBeUndefined();
  });

  it("requests a fresh terminal code when start pairing is triggered", async () => {
    await import("../src/service-worker.js");
    vi.runOnlyPendingTimers();
    await Promise.resolve();

    fetchSpy.mockClear();

    const response = await sendRuntimeMessage({ type: "START_PAIRING" });
    expect(response).toEqual({ success: true, expiresAt: expect.any(Number) });

    const startCall = fetchSpy.mock.calls.find(
      (call) => String(call[0]).endsWith("/mobile/pair/start")
    );
    expect(startCall).toBeDefined();
    const init = startCall?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ regenerateCode: true, refreshQr: true });
  });

  it("returns a lockout-specific error when pairing is rate limited", async () => {
    fetchSpy.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/mobile/pair/start")) {
        return {
          ok: true,
          json: async () => ({ expiresAt: Date.now() + 120_000 }),
        } as Response;
      }
      if (url.endsWith("/mobile/pair/confirm")) {
        const parsed = JSON.parse((init?.body as string) ?? "{}");
        if (parsed.code === "777777") {
          return {
            ok: false,
            status: 429,
            json: async () => ({ error: "Too Many Requests", retryAfterMs: 90_000 }),
          } as Response;
        }
        return {
          ok: false,
          status: 401,
          json: async () => ({ error: "Invalid code" }),
        } as Response;
      }
      return {
        ok: false,
        status: 404,
      } as Response;
    });

    await import("../src/service-worker.js");
    vi.runOnlyPendingTimers();
    await Promise.resolve();

    const result = await sendRuntimeMessage({ type: "CONFIRM_PAIRING", code: "777777" });
    expect(result.success).toBe(false);
    expect(String(result.error)).toContain("Too many incorrect attempts");
    expect(String(result.error)).toContain("90");
  });
});
