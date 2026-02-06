import { randomBytes } from "crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";

export const DEFAULT_TOKEN_DIR = join(homedir(), ".codex-blocker");
export const DEFAULT_TOKEN_PATH = join(DEFAULT_TOKEN_DIR, "token");

export function createAuthToken(): string {
  return randomBytes(32).toString("hex");
}

export function loadTokenFromPath(tokenPath: string): string | null {
  if (!existsSync(tokenPath)) return null;
  try {
    return readFileSync(tokenPath, "utf-8").trim() || null;
  } catch {
    return null;
  }
}

export function saveTokenToPath(tokenPath: string, token: string): void {
  const tokenDir = dirname(tokenPath);
  if (!existsSync(tokenDir)) {
    mkdirSync(tokenDir, { recursive: true, mode: 0o700 });
  }

  writeFileSync(tokenPath, token, { encoding: "utf-8", mode: 0o600 });

  try {
    chmodSync(tokenPath, 0o600);
  } catch {
    // Ignore permission adjustments on unsupported platforms/filesystems.
  }
}

export function rotateTokenAtPath(tokenPath: string): string {
  const token = createAuthToken();
  saveTokenToPath(tokenPath, token);
  return token;
}
