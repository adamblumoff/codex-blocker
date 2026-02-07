import { describe, expect, it } from "vitest";
import {
  isLoopbackClientIp,
  isTrustedChromeExtensionOrigin,
} from "../src/server.js";

describe("origin and loopback guards", () => {
  it("accepts valid chrome extension origins", () => {
    expect(
      isTrustedChromeExtensionOrigin(
        "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      )
    ).toBe(true);
  });

  it("rejects non-extension origins", () => {
    expect(isTrustedChromeExtensionOrigin("https://example.com")).toBe(false);
  });

  it("accepts local loopback client addresses", () => {
    expect(isLoopbackClientIp("127.0.0.1")).toBe(true);
    expect(isLoopbackClientIp("::1")).toBe(true);
    expect(isLoopbackClientIp("::ffff:127.0.0.1")).toBe(true);
  });

  it("rejects non-loopback addresses", () => {
    expect(isLoopbackClientIp("192.168.68.54")).toBe(false);
  });
});
