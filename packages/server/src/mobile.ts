import { randomBytes, randomInt } from "crypto";
import { MOBILE_PAIRING_TTL_MS } from "./types.js";

type PairingRecord = {
  code: string;
  expiresAt: number;
};

type Logger = (message: string) => void;

export type PairingStatus = {
  active: boolean;
  expiresAt: number | null;
};

export type PairingCode = {
  code: string;
  expiresAt: number;
};

export class MobilePairingManager {
  private pairing: PairingRecord | null = null;

  constructor(
    private readonly log: Logger = () => {},
    private readonly now: () => number = () => Date.now()
  ) {}

  startPairing(): PairingCode {
    const next = {
      code: randomInt(0, 1_000_000).toString().padStart(6, "0"),
      expiresAt: this.now() + MOBILE_PAIRING_TTL_MS,
    };
    this.pairing = next;
    this.log(
      `\n[Codex Blocker] Mobile pairing code: ${next.code} (expires in 2 minutes)\n`
    );
    return next;
  }

  getStatus(): PairingStatus {
    this.expireIfNeeded();
    return {
      active: this.pairing !== null,
      expiresAt: this.pairing?.expiresAt ?? null,
    };
  }

  confirmPairing(code: string): boolean {
    this.expireIfNeeded();
    if (!this.pairing) return false;
    if (code.trim() !== this.pairing.code) return false;
    this.pairing = null;
    return true;
  }

  private expireIfNeeded(): void {
    if (!this.pairing) return;
    if (this.now() >= this.pairing.expiresAt) {
      this.pairing = null;
    }
  }
}

export function createServerToken(): string {
  return randomBytes(32).toString("hex");
}

export function createServerInstanceId(): string {
  return randomBytes(8).toString("hex");
}
