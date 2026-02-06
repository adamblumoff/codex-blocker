import { describe, expect, it } from "vitest";
import { canBootstrapAuthToken } from "../src/server.js";

const VALID_EXTENSION_ORIGIN =
  "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("auth token bootstrap guard", () => {
  it("allows bootstrap only for loopback extension clients when token is unset", () => {
    const allowed = canBootstrapAuthToken({
      authToken: null,
      providedToken: "new-token",
      origin: VALID_EXTENSION_ORIGIN,
      clientIp: "127.0.0.1",
    });
    expect(allowed).toBe(true);
  });

  it("rejects bootstrap from non-loopback clients", () => {
    const allowed = canBootstrapAuthToken({
      authToken: null,
      providedToken: "new-token",
      origin: VALID_EXTENSION_ORIGIN,
      clientIp: "192.168.68.99",
    });
    expect(allowed).toBe(false);
  });

  it("rejects bootstrap when an auth token already exists", () => {
    const allowed = canBootstrapAuthToken({
      authToken: "existing-token",
      providedToken: "new-token",
      origin: VALID_EXTENSION_ORIGIN,
      clientIp: "127.0.0.1",
    });
    expect(allowed).toBe(false);
  });

  it("rejects invalid extension origins", () => {
    const allowed = canBootstrapAuthToken({
      authToken: null,
      providedToken: "new-token",
      origin: "https://example.com",
      clientIp: "127.0.0.1",
    });
    expect(allowed).toBe(false);
  });
});
