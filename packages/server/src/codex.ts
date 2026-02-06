import { existsSync, createReadStream, promises as fs } from "fs";
import { homedir } from "os";
import { join } from "path";
import { SessionState } from "./state.js";
import {
  isRolloutFile,
  parseCodexLine,
  sessionIdFromPath,
} from "./codex-parse.js";
import { CODEX_SESSIONS_SCAN_INTERVAL_MS } from "./types.js";

const DEFAULT_CODEX_HOME = join(homedir(), ".codex");

type FileState = {
  position: number;
  remainder: string;
  sessionId: string;
  hasAssistantPhaseSignals: boolean;
  pendingLegacyIdleAt?: number;
};

const LEGACY_AGENT_MESSAGE_IDLE_GRACE_MS = 4_000;

async function listRolloutFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listRolloutFiles(fullPath)));
    } else if (entry.isFile() && isRolloutFile(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

async function readNewLines(filePath: string, fileState: FileState): Promise<string[]> {
  const stat = await fs.stat(filePath);
  if (stat.size < fileState.position) {
    fileState.position = 0;
    fileState.remainder = "";
  }
  if (stat.size === fileState.position) return [];

  const start = fileState.position;
  const end = Math.max(stat.size - 1, start);
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath, { start, end });
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("error", reject);
    stream.on("end", resolve);
  });

  fileState.position = stat.size;
  const content = fileState.remainder + Buffer.concat(chunks).toString("utf-8");
  const lines = content.split("\n");
  fileState.remainder = content.endsWith("\n") ? "" : lines.pop() ?? "";
  return lines.filter((line) => line.trim().length > 0);
}

export type CodexSessionWatcherOptions = {
  sessionsDir?: string;
};

export class CodexSessionWatcher {
  private fileStates: Map<string, FileState> = new Map();
  private scanTimer: NodeJS.Timeout | null = null;
  private warnedMissing = false;
  private sessionsDir: string;
  private state: SessionState;

  constructor(state: SessionState, options?: CodexSessionWatcherOptions) {
    this.state = state;
    const base = process.env.CODEX_HOME ?? DEFAULT_CODEX_HOME;
    this.sessionsDir = options?.sessionsDir ?? join(base, "sessions");
  }

  start(): void {
    this.scan();
    this.scanTimer = setInterval(() => {
      this.scan();
    }, CODEX_SESSIONS_SCAN_INTERVAL_MS);
  }

  stop(): void {
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }
  }

  private async scan(): Promise<void> {
    if (!existsSync(this.sessionsDir)) {
      if (!this.warnedMissing) {
        console.log(`Waiting for Codex sessions at ${this.sessionsDir}`);
        this.warnedMissing = true;
      }
      return;
    }
    this.warnedMissing = false;

    let files: string[] = [];
    try {
      files = await listRolloutFiles(this.sessionsDir);
    } catch {
      return;
    }
    for (const filePath of files) {
      const fileState =
        this.fileStates.get(filePath) ??
        {
          position: 0,
          remainder: "",
          sessionId: sessionIdFromPath(filePath),
          hasAssistantPhaseSignals: false,
        };
      if (!this.fileStates.has(filePath)) {
        this.fileStates.set(filePath, fileState);
        try {
          const stat = await fs.stat(filePath);
          fileState.position = stat.size;
        } catch {
          continue;
        }
        continue;
      }

      let newLines: string[] = [];
      try {
        newLines = await readNewLines(filePath, fileState);
      } catch {
        continue;
      }
      if (newLines.length === 0) {
        this.maybeFlushLegacyIdle(fileState);
        continue;
      }
      for (const line of newLines) {
        const parsed = parseCodexLine(line, fileState.sessionId);
        fileState.sessionId = parsed.sessionId;
        if (parsed.previousSessionId) {
          this.state.removeSession(parsed.previousSessionId);
          fileState.hasAssistantPhaseSignals = false;
          fileState.pendingLegacyIdleAt = undefined;
        }
        if (parsed.assistantMessagePhase) {
          fileState.hasAssistantPhaseSignals = true;
          fileState.pendingLegacyIdleAt = undefined;
        }
        this.state.markCodexSessionSeen(parsed.sessionId, parsed.cwd);
        if (parsed.markWorking || parsed.markActivity) {
          fileState.pendingLegacyIdleAt = undefined;
          this.state.handleCodexActivity({
            sessionId: parsed.sessionId,
            cwd: parsed.cwd,
          });
        }
        if (parsed.markWaitingForInput) {
          fileState.pendingLegacyIdleAt = undefined;
          this.state.setWaitingForInput(parsed.sessionId, parsed.cwd);
        }
        if (parsed.markIdle) {
          fileState.pendingLegacyIdleAt = undefined;
          this.state.setCodexIdle(parsed.sessionId, parsed.cwd);
        }
        if (parsed.markLegacyIdleCandidate && !fileState.hasAssistantPhaseSignals) {
          fileState.pendingLegacyIdleAt ??= Date.now();
        }
      }
      this.maybeFlushLegacyIdle(fileState);
    }
  }

  private maybeFlushLegacyIdle(fileState: FileState): void {
    if (!fileState.pendingLegacyIdleAt) return;
    if (Date.now() - fileState.pendingLegacyIdleAt < LEGACY_AGENT_MESSAGE_IDLE_GRACE_MS) {
      return;
    }
    this.state.setCodexIdle(fileState.sessionId);
    fileState.pendingLegacyIdleAt = undefined;
  }
}
