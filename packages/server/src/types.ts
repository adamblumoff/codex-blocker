export interface CodexActivity {
  sessionId: string;
  cwd?: string;
  idleTimeoutMs: number;
}

// Session state tracked by server
export interface Session {
  id: string;
  status: "idle" | "working" | "waiting_for_input";
  lastActivity: Date;
  lastSeen: Date;
  waitingForInputSince?: Date;
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

// Server configuration
export const DEFAULT_PORT = 8765;
export const SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
export const CODEX_ACTIVITY_IDLE_TIMEOUT_MS = 60 * 1000; // 1 minute
export const CODEX_SESSIONS_SCAN_INTERVAL_MS = 2_000; // 2 seconds
