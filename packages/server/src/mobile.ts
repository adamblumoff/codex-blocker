import { randomBytes, randomInt } from "crypto";
import { MOBILE_PAIRING_TTL_MS, MOBILE_QR_PAIRING_TTL_MS } from "./types.js";

type ExtensionPairingRecord = {
  code: string;
  expiresAt: number;
};

type MobileQrPairingRecord = {
  expiresAt: number;
  qrNonce: string;
  qrExpiresAt: number;
};

export type PairingStatus = {
  active: boolean;
  expiresAt: number | null;
};

export type ExtensionPairingCode = {
  code: string;
  expiresAt: number;
};

export class ExtensionPairingManager {
  private pairing: ExtensionPairingRecord | null = null;

  constructor(private readonly now: () => number = () => Date.now()) {}

  startPairing(regenerateCode = false): ExtensionPairingCode {
    this.expireIfNeeded();
    if (this.pairing && !regenerateCode) {
      return { ...this.pairing };
    }

    const next = {
      code: randomInt(0, 1_000_000).toString().padStart(6, "0"),
      expiresAt: this.now() + MOBILE_PAIRING_TTL_MS,
    };
    this.pairing = next;
    return { ...next };
  }

  getStatus(): PairingStatus {
    this.expireIfNeeded();
    return {
      active: this.pairing !== null,
      expiresAt: this.pairing?.expiresAt ?? null,
    };
  }

  confirmPairingCode(code: string): boolean {
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

export type MobileQrPairingCode = {
  expiresAt: number;
  qrNonce: string;
  qrExpiresAt: number;
};

export class MobileQrPairingManager {
  private pairing: MobileQrPairingRecord | null = null;

  constructor(private readonly now: () => number = () => Date.now()) {}

  startPairing(refreshQr = false): MobileQrPairingCode {
    this.expireIfNeeded();
    if (this.pairing && !refreshQr) {
      return { ...this.pairing };
    }

    if (this.pairing && refreshQr) {
      const nextQrExpiry = this.now() + MOBILE_QR_PAIRING_TTL_MS;
      const refreshed = {
        ...this.pairing,
        qrNonce: randomBytes(16).toString("hex"),
        qrExpiresAt: Math.max(nextQrExpiry, this.pairing.qrExpiresAt + 1),
      };
      this.pairing = refreshed;
      return { ...refreshed };
    }

    const next = {
      expiresAt: this.now() + MOBILE_PAIRING_TTL_MS,
      qrNonce: randomBytes(16).toString("hex"),
      qrExpiresAt: this.now() + MOBILE_QR_PAIRING_TTL_MS,
    };
    this.pairing = next;
    return { ...next };
  }

  getStatus(): PairingStatus {
    this.expireIfNeeded();
    return {
      active: this.pairing !== null,
      expiresAt: this.pairing?.expiresAt ?? null,
    };
  }

  confirmPairingQrNonce(qrNonce: string): boolean {
    this.expireIfNeeded();
    if (!this.pairing) return false;
    if (this.now() >= this.pairing.qrExpiresAt) return false;
    if (qrNonce.trim() !== this.pairing.qrNonce) return false;
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

export function createServerInstanceId(): string {
  return randomBytes(8).toString("hex");
}
