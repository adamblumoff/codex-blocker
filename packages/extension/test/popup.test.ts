// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("popup", () => {
  const syncData: Record<string, unknown> = {};

  beforeEach(() => {
    vi.useFakeTimers();
    Object.keys(syncData).forEach((key) => delete syncData[key]);
    Object.assign(syncData, { roastMode: false });

    document.body.innerHTML = `
      <span id="status-dot"></span>
      <span id="status-text"></span>
      <span id="sessions"></span>
      <span id="working"></span>
      <div id="block-badge"></div>
      <div id="block-status"></div>
      <button id="settings-btn"></button>
      <input id="roast-toggle" type="checkbox" />
    `;

    let stateCall = 0;

    globalThis.chrome = {
      runtime: {
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
                forceBlock: false,
                forceOpen: false,
              });
            } else {
              callback?.({
                blocked: true,
                serverConnected: true,
                sessions: 2,
                working: 1,
                bypassActive: false,
                forceBlock: false,
                forceOpen: false,
              });
            }
            return;
          }
          return Promise.resolve();
        },
        onMessage: {
          addListener: vi.fn(),
        },
        openOptionsPage: vi.fn(),
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
        onChanged: {
          addListener: vi.fn(),
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

  it("refreshes UI and toggles roast mode", async () => {
    await import("../src/popup.js");

    vi.advanceTimersByTime(5000);

    const roastToggle = document.getElementById("roast-toggle") as HTMLInputElement;
    roastToggle.checked = true;
    roastToggle.dispatchEvent(new Event("change"));

    expect(syncData.roastMode).toBe(true);

    const settingsBtn = document.getElementById("settings-btn") as HTMLButtonElement;
    settingsBtn.click();
    expect((chrome.runtime.openOptionsPage as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
  });
});
