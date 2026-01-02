export interface CodexActivity {
  sessionId: string;
  cwd?: string;
  idleTimeoutMs: number;
}

// Session state tracked by server
export interface Session {
  id: string;
  status: "idle" | "working";
  lastActivity: Date;
  lastSeen: Date;
  cwd?: string;
  idleTimeoutMs?: number;
}

// WebSocket messages from server to extension
export type ServerMessage =
  | {
      type: "state";
      blocked: boolean;
      sessions: number;
      working: number;
      waitingForInput: number;
    }
  | { type: "pong" };

// WebSocket messages from extension to server
export type ClientMessage = { type: "ping" } | { type: "subscribe" };

// Extension storage schema
export interface ExtensionState {
  blockedDomains: string[];
  lastBypassDate: string | null; // ISO date string, e.g. "2025-01-15"
  bypassUntil: number | null; // timestamp when current bypass expires
}

// Default blocked domains
export const DEFAULT_BLOCKED_DOMAINS = ["x.com", "youtube.com"];

// Server configuration
export const DEFAULT_PORT = 8765;
export const SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
export const CODEX_ACTIVITY_IDLE_TIMEOUT_MS = 60 * 1000; // 1 minute
export const CODEX_SESSIONS_SCAN_INTERVAL_MS = 2_000; // 2 seconds
export const KEEPALIVE_INTERVAL_MS = 20 * 1000; // 20 seconds
