export type CodexStatus = {
  blocked: boolean;
  sessions: number;
  working: number;
  waitingForInput: number;
};

export type ConnectionPhase =
  | "booting"
  | "discovering"
  | "pairing"
  | "connecting"
  | "connected"
  | "error";

export type MobilePreferences = {
  notificationsEnabled: boolean;
  blockingEnabled: boolean;
};
