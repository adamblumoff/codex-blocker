import QRCode from "qrcode";

export const PAIRING_QR_FORMAT = "cbm-v1";
const PAIRING_QR_PREFIX = "CBM1";

export type PairingQrPayloadInput = {
  host: string;
  port: number;
  instanceId: string;
  qrNonce: string;
  expiresAt: number;
};

export function encodePairingQrPayload(input: PairingQrPayloadInput): string {
  const host = encodeURIComponent(input.host);
  const instanceId = encodeURIComponent(input.instanceId);
  const qrNonce = encodeURIComponent(input.qrNonce);
  return `${PAIRING_QR_PREFIX};h=${host};p=${input.port};i=${instanceId};n=${qrNonce};e=${input.expiresAt}`;
}

export async function renderPairingQr(payload: string): Promise<string> {
  return QRCode.toString(payload, { type: "terminal", small: true });
}
