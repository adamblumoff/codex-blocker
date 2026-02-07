// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("popup", () => {
  const syncData: Record<string, unknown> = {};
  const sentMessages: any[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    Object.keys(syncData).forEach((key) => delete syncData[key]);
    Object.assign(syncData, { roastMode: false });
    sentMessages.length = 0;

    document.body.innerHTML = `
      <span id="status-dot"></span>
      <span id="status-text"></span>
      <div id="connection-note"></div>
      <span id="sessions"></span>
      <span id="working"></span>
      <div id="block-badge"></div>
      <div id="block-status"></div>
      <div id="pairing-panel" hidden>
        <input id="pairing-code" />
        <button id="pairing-submit"></button>
        <button id="pairing-refresh"></button>
        <div id="pairing-message"></div>
      </div>
      <button id="settings-btn"></button>
      <input id="roast-toggle" type="checkbox" />
    `;

    let stateCall = 0;
    let paired = false;

    globalThis.chrome = {
      runtime: {
        sendMessage: (message: any, callback?: (response?: any) => void) => {
          sentMessages.push(message);
          if (message.type === "GET_STATE") {
            stateCall += 1;
            if (!paired && stateCall === 1) {
              callback?.({
                blocked: false,
                serverConnected: false,
                sessions: 0,
                working: 0,
                bypassActive: false,
                forceBlock: false,
                forceOpen: false,
                pairingRequired: true,
                pairingExpiresAt: Date.now() + 120_000,
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
                pairingRequired: false,
                pairingExpiresAt: null,
              });
            }
            return;
          }
          if (message.type === "CONFIRM_PAIRING") {
            paired = message.code === "123456";
            callback?.(paired ? { success: true } : { success: false, error: "Invalid code" });
            return;
          }
          if (message.type === "START_PAIRING") {
            callback?.({ success: true, expiresAt: Date.now() + 120_000 });
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

  it("shows pairing UI when required and confirms code", async () => {
    await import("../src/popup.js");

    const panel = document.getElementById("pairing-panel") as HTMLElement;
    const connectionNote = document.getElementById("connection-note") as HTMLElement;
    expect(panel.hidden).toBe(false);
    expect(connectionNote.textContent?.length).toBeGreaterThan(0);

    const input = document.getElementById("pairing-code") as HTMLInputElement;
    const submit = document.getElementById("pairing-submit") as HTMLButtonElement;
    input.value = "123456";
    submit.click();

    vi.runOnlyPendingTimers();
    await Promise.resolve();

    expect(sentMessages.some((message) => message.type === "CONFIRM_PAIRING")).toBe(true);
    expect(panel.hidden).toBe(true);

    const roastToggle = document.getElementById("roast-toggle") as HTMLInputElement;
    roastToggle.checked = true;
    roastToggle.dispatchEvent(new Event("change"));

    expect(syncData.roastMode).toBe(true);

    const settingsBtn = document.getElementById("settings-btn") as HTMLButtonElement;
    settingsBtn.click();
    expect((chrome.runtime.openOptionsPage as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
  });
});
