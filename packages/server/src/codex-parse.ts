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
  markActivity: boolean;
  markWaitingForInput: boolean;
  markIdle: boolean;
  markLegacyIdleCandidate: boolean;
  assistantMessagePhase?: string;
};

export function parseCodexLine(line: string, sessionId: string): ParsedCodexLine {
  let currentSessionId = sessionId;
  let previousSessionId: string | undefined;
  let cwd: string | undefined;
  let markWorking = false;
  let markActivity = false;
  let markWaitingForInput = false;
  let markIdle = false;
  let markLegacyIdleCandidate = false;
  let assistantMessagePhase: string | undefined;
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
      // Legacy Codex logs use agent_message as the terminal assistant event.
      // Newer logs include intermediate assistant commentary, so this is only
      // a fallback signal and must be validated by the watcher.
      markLegacyIdleCandidate = true;
    }
    if (entryType === "event_msg" && innerTypeString === "agent_reasoning") {
      markActivity = true;
    }
    if (entryType === "event_msg" && innerTypeString === "item_completed") {
      markIdle = true;
    }
    if (entryType === "response_item" && innerTypeString === "message") {
      const role =
        innerPayload && typeof innerPayload === "object"
          ? (innerPayload as Record<string, unknown>).role
          : undefined;
      if (role === "user") {
        const messageText = extractMessageText(innerPayload);
        if (!messageText || !messageText.trim().startsWith("<environment_context>")) {
          markWorking = true;
        }
      }
      if (role === "assistant" && innerPayload && typeof innerPayload === "object") {
        const phase = (innerPayload as Record<string, unknown>).phase;
        if (typeof phase === "string" && phase.length > 0) {
          assistantMessagePhase = phase;
          if (phase === "final_answer") {
            markIdle = true;
          } else if (phase === "commentary") {
            markActivity = true;
          }
        }
      }
    }
    if (entryType === "response_item" && innerTypeString === "function_call") {
      const callName =
        innerPayload && typeof innerPayload === "object"
          ? (innerPayload as Record<string, unknown>).name
          : undefined;
      if (callName === "request_user_input") {
        markWaitingForInput = true;
      } else {
        markActivity = true;
      }
    }
    if (
      entryType === "response_item" &&
      (innerTypeString === "reasoning" ||
        innerTypeString === "function_call_output" ||
        innerTypeString === "custom_tool_call" ||
        innerTypeString === "custom_tool_call_output")
    ) {
      markActivity = true;
    }
  } catch {
    // Ignore malformed lines
  }

  return {
    sessionId: currentSessionId,
    previousSessionId,
    cwd,
    markWorking,
    markActivity,
    markWaitingForInput,
    markIdle,
    markLegacyIdleCandidate,
    assistantMessagePhase,
  };
}

function extractMessageText(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const record = payload as Record<string, unknown>;
  const content = record.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return undefined;
  const parts: string[] = [];
  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    const text = (item as Record<string, unknown>).text;
    if (typeof text === "string") parts.push(text);
  }
  return parts.length > 0 ? parts.join("\n") : undefined;
}
