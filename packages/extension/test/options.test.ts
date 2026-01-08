// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("options page", () => {
  const syncData: Record<string, unknown> = {};
  let storageChangeListeners: Array<
    (changes: Record<string, { newValue: unknown }>, area: string) => void
  > = [];

  beforeEach(() => {
    vi.useFakeTimers();
    storageChangeListeners = [];
    Object.keys(syncData).forEach((key) => delete syncData[key]);
    Object.assign(syncData, {
      blockedDomains: ["example.com"],
      roastMode: false,
      lastBypassDate: null,
    });

    document.body.innerHTML = `
      <div id="status-indicator"></div>
      <div id="status-text"></div>
      <div id="extension-version"></div>
      <div id="sessions"></div>
      <div id="working"></div>
      <div id="block-status"></div>
      <div id="blocking-card"></div>
      <form id="add-form"><input id="domain-input" /><button type="submit">Add</button></form>
      <ul id="domain-list"></ul>
      <div id="site-count"></div>
      <button id="bypass-btn"></button>
      <span id="bypass-text"></span>
      <span id="bypass-status"></span>
      <input id="enabled-toggle" type="checkbox" />
      <input id="pause-media-toggle" type="checkbox" />
      <input id="force-block-toggle" type="checkbox" />
      <input id="roast-toggle" type="checkbox" />
    `;

    let stateCall = 0;
    let bypassCall = 0;

    globalThis.chrome = {
      runtime: {
        getManifest: () => ({
          version: "0.0.10.4",
          version_name: "0.0.10-alpha.4",
        }),
        sendMessage: (message: any, callback?: (response?: any) => void) => {
          if (message.type === "GET_STATE") {
            stateCall += 1;
            if (stateCall === 1) {
              callback?.({
                blocked: false,
                serverConnected: false,
                sessions: 0,
                working: 0,
                bypassActive: false,
                pauseMedia: true,
                forceBlock: false,
                forceOpen: false,
              });
            } else if (stateCall === 2) {
              callback?.({
                blocked: false,
                serverConnected: true,
                sessions: 1,
                working: 1,
                bypassActive: false,
                pauseMedia: true,
                forceBlock: false,
                forceOpen: false,
              });
            } else {
              callback?.({
                blocked: true,
                serverConnected: true,
                sessions: 2,
                working: 0,
                bypassActive: false,
                pauseMedia: true,
                forceBlock: true,
                forceOpen: false,
              });
            }
            return;
          }
          if (message.type === "GET_BYPASS_STATUS") {
            bypassCall += 1;
            if (bypassCall === 1) {
              callback?.({
                usedToday: false,
                bypassActive: true,
                bypassUntil: Date.now() + 60_000,
              });
            } else {
              callback?.({
                usedToday: true,
                bypassActive: false,
                bypassUntil: null,
              });
            }
            return;
          }
          if (message.type === "ACTIVATE_BYPASS") {
            callback?.({ success: true });
            return;
          }
          return Promise.resolve();
        },
        onMessage: {
          addListener: vi.fn(),
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
          remove: vi.fn((_keys: string | string[], callback?: () => void) => {
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

  it("hydrates UI, saves domains, and toggles roast mode", async () => {
    await import("../src/options.js");

    vi.advanceTimersByTime(5000);
    vi.advanceTimersByTime(5000);

    const roastToggle = document.getElementById("roast-toggle") as HTMLInputElement;
    roastToggle.checked = true;
    roastToggle.dispatchEvent(new Event("change"));

    expect(syncData.roastMode).toBe(true);

    const input = document.getElementById("domain-input") as HTMLInputElement;
    input.value = "github.com";
    const form = document.getElementById("add-form") as HTMLFormElement;
    form.dispatchEvent(new Event("submit"));

    expect(syncData.blockedDomains as string[]).toContain("github.com");

    const removeBtn = document.querySelector(".remove-btn") as HTMLButtonElement;
    removeBtn?.click();

    const bypassBtn = document.getElementById("bypass-btn") as HTMLButtonElement;
    bypassBtn.click();

    storageChangeListeners.forEach((listener) =>
      listener({ roastMode: { newValue: false } }, "sync"),
    );
  });
});
