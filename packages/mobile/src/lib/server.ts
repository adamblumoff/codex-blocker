import type {
  MobileDiscoveryResponse,
  MobilePairConfirmResponse,
  MobilePairStartResponse,
  ServerMessage,
} from "@codex-blocker/shared";
import type { CodexStatus } from "../types";

const DEFAULT_PORT = 8765;

export type DiscoveredServer = {
  host: string;
  port: number;
  info: MobileDiscoveryResponse;
};

function withTimeout(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  };
}

export function buildHttpUrl(host: string, port = DEFAULT_PORT, path = ""): string {
  return `http://${host}:${port}${path}`;
}

export function buildWsUrl(host: string, port = DEFAULT_PORT): string {
  return `ws://${host}:${port}/ws`;
}

export function buildWsProtocols(token: string): string[] {
  return ["codex-blocker.v1", `codex-blocker-token.${token}`];
}

export async function fetchDiscovery(
  host: string,
  port = DEFAULT_PORT,
  timeoutMs = 600
): Promise<DiscoveredServer | null> {
  const timeout = withTimeout(timeoutMs);
  try {
    const response = await fetch(buildHttpUrl(host, port, "/mobile/discovery"), {
      signal: timeout.signal,
    });
    if (!response.ok) return null;
    const info = (await response.json()) as MobileDiscoveryResponse;
    return { host, port, info };
  } catch {
    return null;
  } finally {
    timeout.clear();
  }
}

export async function startPairing(host: string, port = DEFAULT_PORT): Promise<MobilePairStartResponse> {
  const response = await fetch(buildHttpUrl(host, port, "/mobile/pair/start"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!response.ok) {
    throw new Error("Unable to start mobile pairing.");
  }
  return (await response.json()) as MobilePairStartResponse;
}

export async function confirmPairing(
  host: string,
  code: string,
  port = DEFAULT_PORT
): Promise<MobilePairConfirmResponse> {
  const response = await fetch(buildHttpUrl(host, port, "/mobile/pair/confirm"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });

  if (!response.ok) {
    throw new Error("Unable to confirm mobile pairing.");
  }

  return (await response.json()) as MobilePairConfirmResponse;
}

export async function fetchStatus(
  host: string,
  token: string,
  port = DEFAULT_PORT
): Promise<CodexStatus | null> {
  const timeout = withTimeout(1000);
  try {
    const response = await fetch(buildHttpUrl(host, port, "/status"), {
      headers: { Authorization: `Bearer ${token}` },
      signal: timeout.signal,
    });
    if (!response.ok) return null;
    return (await response.json()) as CodexStatus;
  } catch {
    return null;
  } finally {
    timeout.clear();
  }
}

export function parseStateMessage(data: string): CodexStatus | null {
  try {
    const payload = JSON.parse(data) as ServerMessage;
    if (payload.type !== "state") return null;
    return {
      blocked: payload.blocked,
      sessions: payload.sessions,
      working: payload.working,
      waitingForInput: payload.waitingForInput,
    };
  } catch {
    return null;
  }
}
