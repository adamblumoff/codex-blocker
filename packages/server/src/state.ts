import type { Session, CodexActivity, ServerMessage } from "./types.js";
import { SESSION_TIMEOUT_MS } from "./types.js";

type StateChangeCallback = (message: ServerMessage) => void;

export class SessionState {
  private sessions: Map<string, Session> = new Map();
  private listeners: Set<StateChangeCallback> = new Set();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start cleanup interval for stale sessions
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleSessions();
    }, 30_000); // Check every 30 seconds
  }

  subscribe(callback: StateChangeCallback): () => void {
    this.listeners.add(callback);
    // Immediately send current state to new subscriber
    callback(this.getStateMessage());
    return () => this.listeners.delete(callback);
  }

  private broadcast(): void {
    const message = this.getStateMessage();
    for (const listener of this.listeners) {
      listener(message);
    }
  }

  private getStateMessage(): ServerMessage {
    const sessions = Array.from(this.sessions.values());
    const working = sessions.filter((s) => s.status === "working").length;
    const waitingForInput = sessions.filter(
      (s) => s.status === "waiting_for_input"
    ).length;
    return {
      type: "state",
      blocked: working === 0,
      sessions: sessions.length,
      working,
      waitingForInput,
    };
  }

  handleCodexActivity(activity: CodexActivity): void {
    this.ensureSession(activity.sessionId, activity.cwd);
    const session = this.sessions.get(activity.sessionId)!;
    session.status = "working";
    session.waitingForInputSince = undefined;
    session.lastActivity = new Date();
    session.lastSeen = new Date();
    session.idleTimeoutMs = activity.idleTimeoutMs;
    this.broadcast();
  }

  setCodexIdle(sessionId: string, cwd?: string): void {
    this.ensureSession(sessionId, cwd);
    const session = this.sessions.get(sessionId)!;
    if (session.status !== "idle") {
      session.status = "idle";
      session.waitingForInputSince = undefined;
      session.lastActivity = new Date();
      this.broadcast();
    }
  }

  markCodexSessionSeen(sessionId: string, cwd?: string): void {
    const created = this.ensureSession(sessionId, cwd);
    const session = this.sessions.get(sessionId)!;
    session.lastSeen = new Date();
    if (created) {
      this.broadcast();
    }
  }

  removeSession(sessionId: string): void {
    if (this.sessions.delete(sessionId)) {
      this.broadcast();
    }
  }

  private ensureSession(sessionId: string, cwd?: string): boolean {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        id: sessionId,
        status: "idle",
        lastActivity: new Date(),
        lastSeen: new Date(),
        cwd,
      });
      console.log("Codex session connected");
      return true;
    } else if (cwd) {
      const session = this.sessions.get(sessionId)!;
      session.cwd = cwd;
    }
    return false;
  }

  private cleanupStaleSessions(): void {
    const now = Date.now();
    let removed = 0;
    let changed = 0;

    for (const [id, session] of this.sessions) {
      if (now - session.lastSeen.getTime() > SESSION_TIMEOUT_MS) {
        this.sessions.delete(id);
        removed++;
        continue;
      }

      if (
        session.status === "working" &&
        session.idleTimeoutMs &&
        now - session.lastActivity.getTime() > session.idleTimeoutMs
      ) {
        session.status = "idle";
        session.waitingForInputSince = undefined;
        changed++;
      }
    }

    if (removed > 0 || changed > 0) {
      this.broadcast();
    }
  }

  getStatus(): {
    blocked: boolean;
    sessions: number;
    working: number;
    waitingForInput: number;
  } {
    const sessions = Array.from(this.sessions.values());
    const working = sessions.filter((s) => s.status === "working").length;
    const waitingForInput = sessions.filter(
      (s) => s.status === "waiting_for_input"
    ).length;
    return {
      blocked: working === 0,
      sessions: sessions.length,
      working,
      waitingForInput,
    };
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.sessions.clear();
    this.listeners.clear();
  }
}

export const state = new SessionState();
