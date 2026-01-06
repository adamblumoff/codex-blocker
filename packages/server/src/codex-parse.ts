import { basename, dirname } from "path";

export function isRolloutFile(filePath: string): boolean {
  const name = basename(filePath);
  return name === "rollout.jsonl" || /^rollout-.+\.jsonl$/.test(name);
}

export function sessionIdFromPath(filePath: string): string {
  const name = basename(filePath);
  const match = name.match(/^rollout-(.+)\.jsonl$/);
  if (match) return match[1];
  if (name === "rollout.jsonl") {
    const parent = basename(dirname(filePath));
    if (parent !== "sessions") return parent;
  }
  return filePath;
}

export function findFirstStringValue(
  obj: unknown,
  keys: string[],
  maxDepth = 6
): string | undefined {
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

export type ParsedCodexLine = {
  sessionId: string;
  previousSessionId?: string;
  cwd?: string;
  markWorking: boolean;
  markIdle: boolean;
};

export function parseCodexLine(line: string, sessionId: string): ParsedCodexLine {
  let currentSessionId = sessionId;
  let previousSessionId: string | undefined;
  let cwd: string | undefined;
  let markWorking = false;
  let markIdle = false;
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
      if (typeof metaId === "string" && metaId.length > 0 && metaId !== currentSessionId) {
        previousSessionId = currentSessionId;
        currentSessionId = metaId;
      }
    }

    cwd =
      findFirstStringValue(innerPayload, ["cwd"]) ??
      findFirstStringValue(payload, ["cwd"]);

    const innerTypeString = typeof innerType === "string" ? innerType : undefined;
    if (entryType === "event_msg" && innerTypeString === "user_message") {
      markWorking = true;
    }
    if (entryType === "event_msg" && innerTypeString === "agent_message") {
      markIdle = true;
    }
  } catch {
    // Ignore malformed lines
  }

  return {
    sessionId: currentSessionId,
    previousSessionId,
    cwd,
    markWorking,
    markIdle,
  };
}
