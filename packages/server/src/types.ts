export interface CodexActivity {
  sessionId: string;
  cwd?: string;
  idleTimeoutMs?: number;
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

export interface MobileDiscoveryResponse {
  name: string;
  instanceId: string;
  port: number;
  pairingRequired: boolean;
  pairingExpiresAt: number | null;
}

export interface MobilePairStartResponse {
  expiresAt: number;
  qrExpiresAt: number;
  qrFormat: "cbm-v1";
}

export interface MobilePairConfirmRequest {
  code?: string;
  qrNonce?: string;
}

export interface MobilePairConfirmResponse {
  token: string;
  statusUrl: string;
  wsUrl: string;
}

// Server configuration
export const DEFAULT_PORT = 8765;
export const SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
export const CODEX_SESSIONS_SCAN_INTERVAL_MS = 2_000; // 2 seconds
export const MOBILE_PAIRING_TTL_MS = 2 * 60 * 1000; // 2 minutes
export const MOBILE_QR_PAIRING_TTL_MS = 60 * 1000; // 60 seconds
