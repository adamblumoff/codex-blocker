import { describe, expect, it } from "vitest";

function parseCommandFromArgs(argv: string[]): string | null {
  const args = argv.filter((arg) => arg !== "--");
  const flagsWithValues = new Set(["--port", "--bind", "--mobile-name"]);

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if (current.startsWith("--")) {
      if (flagsWithValues.has(current)) {
        index += 1;
      }
      continue;
    }
    return current;
  }

  return null;
}

function getStringFlag(argv: string[], flag: string): string | null {
  const args = argv.filter((arg) => arg !== "--");
  const index = args.indexOf(flag);
  if (index === -1) return null;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) return null;
  return value;
}

function resolveBindHost(argv: string[]): string {
  const args = argv.filter((arg) => arg !== "--");
  const extensionOnly = args.includes("--extension-only");
  const explicitBindHost = getStringFlag(args, "--bind");
  return explicitBindHost ?? (extensionOnly ? "127.0.0.1" : "0.0.0.0");
}

function shouldRunAutoFix(argv: string[], hostCanAutoFix: boolean): boolean {
  const args = argv.filter((arg) => arg !== "--");
  const extensionOnly = args.includes("--extension-only");
  const autoFixDisabled =
    args.includes("--no-auto-fix") || args.includes("--mobile-no-auto-fix");
  return !extensionOnly && !autoFixDisabled && hostCanAutoFix;
}

describe("bin arg command detection", () => {
  it("finds mobile:doctor with forwarded pnpm separator", () => {
    expect(parseCommandFromArgs(["--", "mobile:doctor", "--port", "8765"]))
      .toBe("mobile:doctor");
  });

  it("finds mobile:remove with optional flags before command", () => {
    expect(parseCommandFromArgs(["--port", "9000", "mobile:remove"]))
      .toBe("mobile:remove");
  });

  it("returns null when no command token is present", () => {
    expect(parseCommandFromArgs(["--mobile", "--bind", "0.0.0.0"]))
      .toBeNull();
  });

  it("accepts legacy --mobile flag before mobile subcommands", () => {
    expect(parseCommandFromArgs(["--mobile", "mobile:doctor"]))
      .toBe("mobile:doctor");
  });

  it("accepts mobile subcommands when --extension-only is present", () => {
    expect(parseCommandFromArgs(["--extension-only", "mobile:doctor"]))
      .toBe("mobile:doctor");
  });
});

describe("bin extension-only option behavior", () => {
  it("defaults bind host to localhost in extension-only mode", () => {
    expect(resolveBindHost(["--extension-only"])).toBe("127.0.0.1");
  });

  it("keeps default bind host when extension-only is not set", () => {
    expect(resolveBindHost([])).toBe("0.0.0.0");
  });

  it("allows explicit bind host override in extension-only mode", () => {
    expect(resolveBindHost(["--extension-only", "--bind", "0.0.0.0"]))
      .toBe("0.0.0.0");
  });

  it("disables startup auto-fix in extension-only mode", () => {
    expect(shouldRunAutoFix(["--extension-only"], true)).toBe(false);
  });

  it("runs startup auto-fix by default when supported and not extension-only", () => {
    expect(shouldRunAutoFix([], true)).toBe(true);
  });
});
