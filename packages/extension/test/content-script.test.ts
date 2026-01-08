// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://example.com/" }
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/phrase-rotation.js", () => ({
  startRandomPhraseRotation: vi.fn(() => () => {}),
}));

describe("content-script", () => {
  let runtimeMessageListeners: Array<(message: any) => void> = [];
  let storageChangeListeners: Array<
    (changes: Record<string, { newValue: unknown }>, area: string) => void
  > = [];
  let portMessageListener: ((message: any) => void) | null = null;
  let video: HTMLVideoElement | null = null;
  let runtimeMessages: any[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    runtimeMessageListeners = [];
    storageChangeListeners = [];
    portMessageListener = null;
    runtimeMessages = [];

    document.body.innerHTML = "";
    video = document.createElement("video");
    Object.defineProperty(video, "paused", { value: false, writable: true });
    Object.defineProperty(video, "pause", {
      value: vi.fn(() => {
        (video as { paused: boolean }).paused = true;
      }),
    });
    Object.defineProperty(video, "play", {
      value: vi.fn(() => {
        (video as { paused: boolean }).paused = false;
        return Promise.resolve();
      }),
    });
    document.body.appendChild(video);

    const port = {
      onMessage: {
        addListener: (listener: (message: any) => void) => {
          portMessageListener = listener;
        },
      },
      onDisconnect: {
        addListener: vi.fn(),
      },
      postMessage: vi.fn(),
    };

    const syncData: Record<string, unknown> = {
      blockedDomains: ["example.com"],
      roastMode: false,
    };

    globalThis.chrome = {
      runtime: {
        getURL: (path: string) => `chrome-extension://${path}`,
        connect: vi.fn(() => port),
        sendMessage: (message: any, callback?: (response?: any) => void) => {
          runtimeMessages.push(message);
          if (message.type === "GET_BYPASS_STATUS") {
            callback?.({ usedToday: false, bypassActive: false, bypassUntil: null });
            return;
          }
          if (message.type === "GET_PHRASE_SEED") {
            callback?.({ seed: 123 });
            return;
          }
          if (message.type === "ACTIVATE_BYPASS") {
            callback?.({ success: true });
            return;
          }
          if (message.type === "GET_STATE") {
            callback?.({
              pauseMedia: false,
              forceBlock: false,
              forceOpen: false,
              serverConnected: true,
              sessions: 1,
              working: 0,
              waitingForInput: 0,
              blocked: false,
              bypassActive: true,
            });
            return;
          }
          callback?.();
        },
        onMessage: {
          addListener: (listener: (message: any) => void) => {
            runtimeMessageListeners.push(listener);
          },
        },
      },
      storage: {
        sync: {
          get: (keys: string[] | string, callback: (result: any) => void) => {
            const list = Array.isArray(keys) ? keys : [keys];
            const result: Record<string, unknown> = {};
            for (const key of list) {
              result[key] = syncData[key];
            }
            callback(result);
          },
          set: vi.fn((data: Record<string, unknown>, callback?: () => void) => {
            Object.assign(syncData, data);
            callback?.();
          }),
        },
        local: {
          get: vi.fn((_keys: string[], callback: (result: any) => void) => {
            callback({});
          }),
          set: vi.fn((_data: Record<string, unknown>, callback?: () => void) => {
            callback?.();
          }),
        },
        onChanged: {
          addListener: (
            listener: (changes: Record<string, { newValue: unknown }>, area: string) => void,
          ) => {
            storageChangeListeners.push(listener);
          },
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
  });

  it("renders modal, toast, and reacts to state updates", async () => {
    await import("../src/content-script.js");

    expect(document.getElementById("codex-blocker-modal")).not.toBeNull();

    portMessageListener?.({
      type: "STATE",
      pauseMedia: false,
      forceBlock: false,
      forceOpen: false,
      serverConnected: true,
      sessions: 1,
      working: 0,
      waitingForInput: 1,
      blocked: true,
      bypassActive: false,
    });

    expect(document.getElementById("codex-blocker-modal")).not.toBeNull();
    expect(document.getElementById("codex-blocker-toast")).not.toBeNull();

    const modal = document.getElementById("codex-blocker-modal") as HTMLElement;
    const bypassBtn = modal.shadowRoot?.getElementById("bypass-btn") as HTMLButtonElement;
    bypassBtn?.click();

    expect(runtimeMessages.some((msg) => msg.type === "ACTIVATE_BYPASS")).toBe(true);
    expect(runtimeMessages.some((msg) => msg.type === "GET_STATE")).toBe(true);

    portMessageListener?.({
      type: "STATE",
      pauseMedia: false,
      forceBlock: false,
      forceOpen: false,
      serverConnected: true,
      sessions: 0,
      working: 0,
      waitingForInput: 0,
      blocked: true,
      bypassActive: false,
    });

    portMessageListener?.({
      type: "STATE",
      pauseMedia: true,
      forceBlock: false,
      forceOpen: false,
      serverConnected: false,
      sessions: 1,
      working: 0,
      waitingForInput: 0,
      blocked: true,
      bypassActive: false,
    });

    const currentVideo = video as HTMLVideoElement;
    expect((currentVideo as { pause: ReturnType<typeof vi.fn> }).pause).toHaveBeenCalled();

    portMessageListener?.({
      type: "STATE",
      pauseMedia: false,
      forceBlock: false,
      forceOpen: true,
      serverConnected: true,
      sessions: 1,
      working: 0,
      waitingForInput: 0,
      blocked: false,
      bypassActive: false,
    });

    expect((currentVideo as { play: ReturnType<typeof vi.fn> }).play).toHaveBeenCalled();
    expect(document.getElementById("codex-blocker-modal")).toBeNull();

    runtimeMessageListeners.forEach((listener) =>
      listener({ type: "DOMAINS_UPDATED", domains: ["example.com"] }),
    );

    storageChangeListeners.forEach((listener) =>
      listener({ roastMode: { newValue: true } }, "sync"),
    );
  });
});
