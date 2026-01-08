import { afterEach, describe, expect, it, vi } from "vitest";

import { startPhraseRotation, startRandomPhraseRotation } from "../src/lib/phrase-rotation.js";

describe("startPhraseRotation", () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    globalThis.window = originalWindow;
  });

  it("rotates through phrases and cleans up", () => {
    const onPhrase = vi.fn();
    let intervalCallback: (() => void) | null = null;
    let timeoutCallback: (() => void) | null = null;
    const setIntervalSpy = vi.fn((callback: () => void) => {
      intervalCallback = callback;
      return 42 as unknown as number;
    });
    const clearIntervalSpy = vi.fn();
    const setTimeoutSpy = vi.fn((callback: () => void) => {
      timeoutCallback = callback;
      return 99 as unknown as number;
    });
    const clearTimeoutSpy = vi.fn();
    let now = 0;

    globalThis.window = {
      setInterval: setIntervalSpy,
      clearInterval: clearIntervalSpy,
      setTimeout: setTimeoutSpy,
      clearTimeout: clearTimeoutSpy,
    } as Window;

    const stop = startPhraseRotation({
      phrases: ["One", "Two"],
      intervalMs: 1000,
      onPhrase,
      startAtMs: 0,
      now: () => now,
    });

    expect(onPhrase).toHaveBeenCalledTimes(1);
    expect(onPhrase).toHaveBeenLastCalledWith("One");

    now = 1000;
    timeoutCallback?.();
    expect(onPhrase).toHaveBeenLastCalledWith("Two");

    now = 2000;
    intervalCallback?.();
    expect(onPhrase).toHaveBeenLastCalledWith("One");

    stop();
    expect(clearTimeoutSpy).toHaveBeenCalledWith(99);
    expect(clearIntervalSpy).toHaveBeenCalledWith(42);
  });

  it("no-ops for empty phrases", () => {
    const onPhrase = vi.fn();
    const setIntervalSpy = vi.fn();
    const setTimeoutSpy = vi.fn();

    globalThis.window = {
      setInterval: setIntervalSpy,
      clearInterval: vi.fn(),
      setTimeout: setTimeoutSpy,
      clearTimeout: vi.fn(),
    } as Window;

    const stop = startPhraseRotation({
      phrases: [],
      intervalMs: 1000,
      onPhrase,
    });

    stop();

    expect(onPhrase).not.toHaveBeenCalled();
    expect(setIntervalSpy).not.toHaveBeenCalled();
    expect(setTimeoutSpy).not.toHaveBeenCalled();
  });
});

describe("startRandomPhraseRotation", () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    globalThis.window = originalWindow;
  });

  it("avoids repeating the last phrase when possible", () => {
    const onPhrase = vi.fn();
    let timeoutCallback: (() => void) | null = null;
    let intervalCallback: (() => void) | null = null;
    const setIntervalSpy = vi.fn((callback: () => void) => {
      intervalCallback = callback;
      return 7 as unknown as number;
    });
    const clearIntervalSpy = vi.fn();
    const setTimeoutSpy = vi.fn((callback: () => void) => {
      timeoutCallback = callback;
      return 8 as unknown as number;
    });
    const clearTimeoutSpy = vi.fn();
    let now = 0;

    globalThis.window = {
      setInterval: setIntervalSpy,
      clearInterval: clearIntervalSpy,
      setTimeout: setTimeoutSpy,
      clearTimeout: clearTimeoutSpy,
    } as Window;

    const stop = startRandomPhraseRotation({
      phrases: ["One", "Two", "Three"],
      intervalMs: 1000,
      onPhrase,
      seed: 123,
      now: () => now,
    });

    expect(onPhrase).toHaveBeenCalledTimes(1);
    const first = onPhrase.mock.calls[0]?.[0];

    now = 1000;
    timeoutCallback?.();
    const second = onPhrase.mock.calls[1]?.[0];

    now = 2000;
    intervalCallback?.();
    const third = onPhrase.mock.calls[2]?.[0];

    expect(second).not.toBe(first);
    expect(third).not.toBe(second);

    stop();
    expect(clearIntervalSpy).toHaveBeenCalledWith(7);
    expect(clearTimeoutSpy).toHaveBeenCalledWith(8);
  });
});
