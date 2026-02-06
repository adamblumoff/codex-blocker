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
});
