export type {
  ClientMessage,
  ExtensionPairConfirmRequest,
  ExtensionPairStartRequest,
  ExtensionPairStartResponse,
  MobileDiscoveryResponse,
  MobilePairConfirmRequest,
  MobilePairConfirmResponse,
  MobilePairStartRequest,
  MobilePairStartResponse,
  ServerMessage,
} from "@codex-blocker/shared";

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

// Server configuration
export const DEFAULT_PORT = 8765;
export const SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
export const CODEX_SESSIONS_SCAN_INTERVAL_MS = 2_000; // 2 seconds
export const MOBILE_PAIRING_TTL_MS = 2 * 60 * 1000; // 2 minutes
export const MOBILE_QR_PAIRING_TTL_MS = 60 * 1000; // 60 seconds
