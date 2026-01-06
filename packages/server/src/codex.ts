import { existsSync, createReadStream, promises as fs } from "fs";
import { homedir } from "os";
import { basename, dirname, join } from "path";
import { state } from "./state.js";
import { CODEX_ACTIVITY_IDLE_TIMEOUT_MS, CODEX_SESSIONS_SCAN_INTERVAL_MS } from "./types.js";

const CODEX_HOME = process.env.CODEX_HOME ?? join(homedir(), ".codex");
const CODEX_SESSIONS_DIR = join(CODEX_HOME, "sessions");

type FileState = {
  position: number;
  remainder: string;
  sessionId: string;
};

function isRolloutFile(filePath: string): boolean {
  const name = basename(filePath);
  return name === "rollout.jsonl" || /^rollout-.+\.jsonl$/.test(name);
}

function sessionIdFromPath(filePath: string): string {
  const name = basename(filePath);
  const match = name.match(/^rollout-(.+)\.jsonl$/);
  if (match) return match[1];
  if (name === "rollout.jsonl") {
    const parent = basename(dirname(filePath));
    if (parent !== "sessions") return parent;
  }
  return filePath;
}

function findFirstStringValue(obj: unknown, keys: string[], maxDepth = 6): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const queue: Array<{ value: unknown; depth: number }> = [{ value: obj, depth: 0 }];
  while (queue.length) {
    const current = queue.shift();
    if (!current) break;
    const { value, depth } = current;
    if (!value || typeof value !== "object") continue;
    const record = value as Record<string, unknown>;
    for (const key of keys) {
      const candidate = record[key];
      if (typeof candidate === "string" && candidate.length > 0) {
        return candidate;
      }
    }
    if (depth >= maxDepth) continue;
    for (const child of Object.values(record)) {
      if (child && typeof child === "object") {
        queue.push({ value: child, depth: depth + 1 });
      }
    }
  }
  return undefined;
}

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

function handleLine(line: string, fileState: FileState): void {
  let sessionId = fileState.sessionId;
  let cwd: string | undefined;
  let shouldMarkWorking = false;
  let shouldMarkIdle = false;
  try {
    const payload = JSON.parse(line) as Record<string, unknown>;
    const entryType = typeof payload.type === "string" ? payload.type : undefined;
    const innerPayload = payload.payload;
    const innerType =
      innerPayload && typeof innerPayload === "object"
        ? (innerPayload as Record<string, unknown>).type
        : undefined;

    if (entryType === "session_meta") {
      const metaId =
        innerPayload && typeof innerPayload === "object"
          ? (innerPayload as Record<string, unknown>).id
          : undefined;
      if (typeof metaId === "string" && metaId.length > 0 && metaId !== sessionId) {
        const previousId = sessionId;
        fileState.sessionId = metaId;
        sessionId = metaId;
        state.removeSession(previousId);
      }
    }

    cwd = findFirstStringValue(innerPayload, ["cwd"]) ?? findFirstStringValue(payload, ["cwd"]);

    const innerTypeString = typeof innerType === "string" ? innerType : undefined;
    if (entryType === "event_msg" && innerTypeString === "user_message") {
      shouldMarkWorking = true;
    }
    if (entryType === "event_msg" && innerTypeString === "agent_message") {
      shouldMarkIdle = true;
    }
  } catch {
    // Ignore malformed lines
  }

  state.markCodexSessionSeen(sessionId, cwd);
  if (shouldMarkWorking) {
    state.handleCodexActivity({
      sessionId,
      cwd,
      idleTimeoutMs: CODEX_ACTIVITY_IDLE_TIMEOUT_MS,
    });
  }
  if (shouldMarkIdle) {
    state.setCodexIdle(sessionId, cwd);
  }
}

export class CodexSessionWatcher {
  private fileStates: Map<string, FileState> = new Map();
  private scanTimer: NodeJS.Timeout | null = null;
  private warnedMissing = false;

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
    if (!existsSync(CODEX_SESSIONS_DIR)) {
      if (!this.warnedMissing) {
        console.log(`Waiting for Codex sessions at ${CODEX_SESSIONS_DIR}`);
        this.warnedMissing = true;
      }
      return;
    }
    this.warnedMissing = false;

    let files: string[] = [];
    try {
      files = await listRolloutFiles(CODEX_SESSIONS_DIR);
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
      if (newLines.length === 0) continue;
      for (const line of newLines) {
        handleLine(line, fileState);
      }
    }
  }
}
