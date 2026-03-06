import { describe, expect, it } from "vitest";

function resolvePort(argv: string[]): number | null {
  const portIndex = argv.indexOf("--port");
  if (portIndex === -1 || !argv[portIndex + 1]) return null;
  const parsed = parseInt(argv[portIndex + 1], 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function isWindowsOrWslRuntime(platform: string, env: Record<string, string | undefined>): boolean {
  if (platform === "win32") return true;
  return Boolean(env.WSL_DISTRO_NAME || env.WSL_INTEROP);
}

function resolveDefaultBindHost(platform: string, env: Record<string, string | undefined>): string {
  return isWindowsOrWslRuntime(platform, env) ? "0.0.0.0" : "127.0.0.1";
}

describe("bin defaults", () => {
  it("parses a custom port", () => {
    expect(resolvePort(["--port", "9000"])).toBe(9000);
  });

  it("returns null when no custom port is provided", () => {
    expect(resolvePort([])).toBeNull();
  });

  it("uses localhost outside Windows/WSL", () => {
    expect(resolveDefaultBindHost("linux", {})).toBe("127.0.0.1");
  });

  it("uses 0.0.0.0 inside WSL", () => {
    expect(resolveDefaultBindHost("linux", { WSL_DISTRO_NAME: "Ubuntu" })).toBe("0.0.0.0");
  });
});
