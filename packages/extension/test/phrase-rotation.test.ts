import { afterEach, describe, expect, it, vi } from "vitest";

import { startPhraseRotation } from "../src/lib/phrase-rotation.js";

describe("startPhraseRotation", () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    globalThis.window = originalWindow;
  });

  it("rotates through phrases and cleans up", () => {
    const onPhrase = vi.fn();
    let intervalCallback: (() => void) | null = null;
    const setIntervalSpy = vi.fn((callback: () => void) => {
      intervalCallback = callback;
      return 42 as unknown as number;
    });
    const clearIntervalSpy = vi.fn();

    globalThis.window = {
      setInterval: setIntervalSpy,
      clearInterval: clearIntervalSpy,
    } as Window;

    const stop = startPhraseRotation({
      phrases: ["One", "Two"],
      intervalMs: 1000,
      onPhrase,
    });

    expect(onPhrase).toHaveBeenCalledTimes(1);
    expect(onPhrase).toHaveBeenLastCalledWith("One");

    intervalCallback?.();
    expect(onPhrase).toHaveBeenLastCalledWith("Two");

    intervalCallback?.();
    expect(onPhrase).toHaveBeenLastCalledWith("One");

    stop();
    expect(clearIntervalSpy).toHaveBeenCalledWith(42);
  });

  it("no-ops for empty phrases", () => {
    const onPhrase = vi.fn();
    const setIntervalSpy = vi.fn();

    globalThis.window = {
      setInterval: setIntervalSpy,
      clearInterval: vi.fn(),
    } as Window;

    const stop = startPhraseRotation({
      phrases: [],
      intervalMs: 1000,
      onPhrase,
    });

    stop();

    expect(onPhrase).not.toHaveBeenCalled();
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });
});
