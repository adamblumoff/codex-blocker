export const PAIRING_QR_PREFIX = "CBM1;";

export type PairingQrPayload = {
  host: string;
  port: number;
  instanceId: string;
  qrNonce: string;
  expiresAt: number;
};

export type PairingQrParseResult =
  | { ok: true; payload: PairingQrPayload }
  | { ok: false; error: string };

function readField(fields: Map<string, string>, key: string): string {
  const raw = fields.get(key);
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return "";
  }
}

export function parsePairingQrPayload(rawPayload: string): PairingQrParseResult {
  const trimmed = rawPayload.trim();
  if (!trimmed.startsWith(PAIRING_QR_PREFIX)) {
    return { ok: false, error: "This QR code is not a Codex Blocker pairing code." };
  }

  const body = trimmed.slice(PAIRING_QR_PREFIX.length);
  const segments = body.split(";").filter((segment) => segment.length > 0);
  const fields = new Map<string, string>();
  for (const segment of segments) {
    const separatorIndex = segment.indexOf("=");
    if (separatorIndex <= 0) continue;
    fields.set(segment.slice(0, separatorIndex), segment.slice(separatorIndex + 1));
  }

  const host = readField(fields, "h");
  const instanceId = readField(fields, "i");
  const qrNonce = readField(fields, "n");

  const rawPort = readField(fields, "p");
  const port = Number.parseInt(rawPort, 10);
  const rawExpiresAt = readField(fields, "e");
  const expiresAt = Number.parseInt(rawExpiresAt, 10);

  if (!host || !instanceId || !qrNonce) {
    return { ok: false, error: "Invalid pairing QR data. Refresh and try again." };
  }
  if (!Number.isInteger(port) || port <= 0 || port >= 65_536) {
    return { ok: false, error: "Invalid pairing QR port. Refresh and try again." };
  }
  if (!Number.isInteger(expiresAt) || expiresAt <= 0) {
    return { ok: false, error: "Invalid pairing QR expiry. Refresh and try again." };
  }

  return {
    ok: true,
    payload: {
      host,
      port,
      instanceId,
      qrNonce,
      expiresAt,
    },
  };
}
