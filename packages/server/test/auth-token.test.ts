import { mkdtemp, readFile, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { loadTokenFromPath, rotateTokenAtPath, saveTokenToPath } from "../src/auth-token.js";

describe("auth token storage", () => {
  it("persists and loads tokens", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "codex-blocker-token-test-"));
    const tokenPath = join(tempDir, "nested", "token");

    try {
      saveTokenToPath(tokenPath, "first-token");
      expect(loadTokenFromPath(tokenPath)).toBe("first-token");

      const rotated = rotateTokenAtPath(tokenPath);
      expect(rotated).toMatch(/^[a-f0-9]{64}$/);
      expect(rotated).not.toBe("first-token");
      expect(loadTokenFromPath(tokenPath)).toBe(rotated);

      const raw = await readFile(tokenPath, "utf-8");
      expect(raw.trim()).toBe(rotated);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("writes token files with owner-only permissions on unix systems", async () => {
    if (process.platform === "win32") {
      return;
    }

    const tempDir = await mkdtemp(join(tmpdir(), "codex-blocker-token-mode-"));
    const tokenPath = join(tempDir, "token");

    try {
      saveTokenToPath(tokenPath, "mode-token");
      const fileStat = await stat(tokenPath);
      expect(fileStat.mode & 0o777).toBe(0o600);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
