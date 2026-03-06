import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("service worker", () => {
  let messageListener: ((message: any, sender: any, sendResponse: (resp: any) => void) => boolean) | null =
    null;
  let connectListener: ((port: any) => void) | null = null;
  const syncData: Record<string, unknown> = {};
  const localData: Record<string, unknown> = {};
  const sendMessageSpy = vi.fn(() => Promise.resolve());

  class FakeWebSocket {
    static OPEN = 1;
    static CONNECTING = 0;
    readyState = FakeWebSocket.CONNECTING;
    onopen?: () => void;
    onmessage?: (event: { data: string }) => void;
    onclose?: () => void;
    onerror?: () => void;
    url: string;
    constructor(url: string) {
      this.url = url;
      setTimeout(() => {
        this.readyState = FakeWebSocket.OPEN;
        this.onopen?.();
      }, 0);
    }
    send(_data: string) {}
  }

  beforeEach(() => {
    vi.useFakeTimers();
    Object.keys(syncData).forEach((key) => delete syncData[key]);
    Object.keys(localData).forEach((key) => delete localData[key]);
    Object.assign(syncData, {
      bypassUntil: Date.now() + 5_000,
      pauseMedia: false,
      forceBlock: false,
      forceOpen: false,
    });

    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;

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
  });

  it("responds to messages and broadcasts state", async () => {
    await import("../src/service-worker.js");

    vi.runOnlyPendingTimers();

    const responses: any[] = [];
    messageListener?.({ type: "GET_STATE" }, null, (resp: any) => responses.push(resp));
    messageListener?.({ type: "SET_FORCE_OPEN", forceOpen: true }, null, (resp: any) =>
      responses.push(resp),
    );
    messageListener?.({ type: "SET_FORCE_BLOCK", forceBlock: true }, null, (resp: any) =>
      responses.push(resp),
    );
    messageListener?.({ type: "ACTIVATE_BYPASS" }, null, (resp: any) => responses.push(resp));
    messageListener?.({ type: "GET_BYPASS_STATUS" }, null, (resp: any) => responses.push(resp));
    messageListener?.({ type: "GET_PHRASE_SEED" }, null, (resp: any) => responses.push(resp));

    expect(responses.length).toBeGreaterThan(0);

    const port = {
      name: "state",
      postMessage: vi.fn(),
      onMessage: { addListener: vi.fn() },
      onDisconnect: { addListener: vi.fn() },
    };
    connectListener?.(port);

    expect(sendMessageSpy).toHaveBeenCalled();
  });
});
