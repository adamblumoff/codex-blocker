import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const CODEX_HOME = process.env.CODEX_HOME ?? join(homedir(), ".codex");
const CODEX_SESSIONS_DIR = join(CODEX_HOME, "sessions");

export function setupCodex(): void {
  console.log(`
┌─────────────────────────────────────────────────┐
│                                                 │
│   Codex Blocker Setup                            │
│                                                 │
│   No hooks needed. The server reads Codex       │
│   session logs from:                             │
│   ${CODEX_SESSIONS_DIR}
│                                                 │
│   Tip: run Codex once to create the sessions    │
│   directory if it doesn't exist yet.            │
│                                                 │
│   Next: Run 'npx codex-blocker' to start        │
│                                                 │
└─────────────────────────────────────────────────┘
`);
}

export function isCodexAvailable(): boolean {
  return existsSync(CODEX_SESSIONS_DIR);
}

export function removeCodexSetup(): void {
  console.log("No Codex hooks to remove.");
}
