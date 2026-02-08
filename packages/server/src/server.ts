import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { WebSocketServer, WebSocket } from "ws";
import type {
  ClientMessage,
  MobileDiscoveryResponse,
  MobilePairConfirmRequest,
  MobilePairConfirmResponse,
  MobilePairStartResponse,
} from "./types.js";
import { DEFAULT_PORT } from "./types.js";
import { SessionState, state as defaultState } from "./state.js";
import { CodexSessionWatcher } from "./codex.js";
import {
  MobilePairingManager,
  createServerInstanceId,
} from "./mobile.js";
import { publishMobileService, type MdnsServiceHandle } from "./mdns.js";
import {
  createAuthToken,
} from "./auth-token.js";
import {
  PAIRING_QR_FORMAT,
  encodePairingQrPayload,
  renderPairingQr,
} from "./pairing-qr.js";
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 60;
const MAX_WS_CONNECTIONS_PER_IP = 3;
const MOBILE_SERVICE_TYPE = "codex-blocker";
const PAIR_CONFIRM_WINDOW_MS = 60_000;
const PAIR_CONFIRM_MAX_FAILURES = 6;
const PAIR_CONFIRM_LOCKOUT_MS = 2 * 60_000;
const WS_TOKEN_PROTOCOL_PREFIX = "codex-blocker-token.";

const INVALID_JSON_SENTINEL = Symbol("invalid-json");

type JsonBody = Record<string, unknown> | typeof INVALID_JSON_SENTINEL;
type RateState = { count: number; resetAt: number };
type PairConfirmState = { failures: number; resetAt: number; lockoutUntil: number };

const rateByIp = new Map<string, RateState>();
const wsConnectionsByIp = new Map<string, number>();
const pairConfirmByIp = new Map<string, PairConfirmState>();

const CHROME_EXTENSION_ID_PATTERN = /^[a-p]{32}$/;

export function isTrustedChromeExtensionOrigin(origin?: string | null): boolean {
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    return (
      parsed.protocol === "chrome-extension:" &&
      CHROME_EXTENSION_ID_PATTERN.test(parsed.hostname)
    );
  } catch {
    return false;
  }
}

export function isLoopbackClientIp(clientIp?: string | null): boolean {
  if (!clientIp) return false;
  const normalized = clientIp.startsWith("::ffff:") ? clientIp.slice(7) : clientIp;
  return normalized === "127.0.0.1" || normalized === "::1";
}

function getClientIp(req: IncomingMessage): string {
  return req.socket.remoteAddress ?? "unknown";
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const state = rateByIp.get(ip);
  if (!state || state.resetAt <= now) {
    rateByIp.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (state.count >= RATE_LIMIT) return false;
  state.count += 1;
  return true;
}

function getPairConfirmState(ip: string): PairConfirmState {
  const now = Date.now();
  const current = pairConfirmByIp.get(ip);
  if (!current || current.resetAt <= now) {
    const next = {
      failures: 0,
      resetAt: now + PAIR_CONFIRM_WINDOW_MS,
      lockoutUntil: 0,
    };
    pairConfirmByIp.set(ip, next);
    return next;
  }
  return current;
}

function canAttemptPairConfirm(ip: string): boolean {
  const state = getPairConfirmState(ip);
  return state.lockoutUntil <= Date.now();
}

function recordPairConfirmFailure(ip: string): void {
  const state = getPairConfirmState(ip);
  state.failures += 1;
  if (state.failures >= PAIR_CONFIRM_MAX_FAILURES) {
    state.failures = 0;
    state.lockoutUntil = Date.now() + PAIR_CONFIRM_LOCKOUT_MS;
  }
}

function clearPairConfirmFailures(ip: string): void {
  pairConfirmByIp.delete(ip);
}

function readAuthToken(req: IncomingMessage, url: URL): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim();
  }
  const query = url.searchParams.get("token");
  if (query) return query;
  const alt = req.headers["x-codex-blocker-token"];
  if (typeof alt === "string" && alt.length > 0) return alt;
  return null;
}

function parseWebSocketProtocols(
  protocolsHeader: string | string[] | undefined
): string[] {
  const raw = Array.isArray(protocolsHeader)
    ? protocolsHeader.join(",")
    : protocolsHeader ?? "";
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function readTokenFromWebSocketProtocols(
  protocolsHeader: string | string[] | undefined
): string | null {
  const protocols = parseWebSocketProtocols(protocolsHeader);
  for (const protocol of protocols) {
    if (protocol.startsWith(WS_TOKEN_PROTOCOL_PREFIX)) {
      const token = protocol.slice(WS_TOKEN_PROTOCOL_PREFIX.length).trim();
      if (token.length > 0) return token;
    }
  }
  return null;
}

function readWebSocketAuthToken(req: IncomingMessage, url: URL): string | null {
  const protocolToken = readTokenFromWebSocketProtocols(
    req.headers["sec-websocket-protocol"]
  );
  if (protocolToken) return protocolToken;
  return readAuthToken(req, url);
}

function decrementWsConnectionCount(clientIp: string): void {
  const next = (wsConnectionsByIp.get(clientIp) ?? 1) - 1;
  if (next <= 0) {
    wsConnectionsByIp.delete(clientIp);
    return;
  }
  wsConnectionsByIp.set(clientIp, next);
}

function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function normalizeListenHost(bindHost: string): string {
  if (bindHost === "0.0.0.0") {
    return "127.0.0.1";
  }
  return bindHost;
}

async function readJsonBody(req: IncomingMessage, maxBytes = 8_192): Promise<JsonBody> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > maxBytes) {
      return INVALID_JSON_SENTINEL;
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf-8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return INVALID_JSON_SENTINEL;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return INVALID_JSON_SENTINEL;
  }
}

function getResponseHost(req: IncomingMessage, bindHost: string, port: number): string {
  if (req.headers.host) {
    return req.headers.host;
  }
  return `${normalizeListenHost(bindHost)}:${port}`;
}

function splitHostAndPort(
  rawHost: string,
  fallbackPort: number
): { host: string; port: number } {
  try {
    const parsed = new URL(`http://${rawHost}`);
    const parsedPort = parsed.port ? Number.parseInt(parsed.port, 10) : fallbackPort;
    return {
      host: parsed.hostname,
      port:
        Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort < 65_536
          ? parsedPort
          : fallbackPort,
    };
  } catch {
    return { host: rawHost, port: fallbackPort };
  }
}

export type ServerOptions = {
  sessionsDir?: string;
  startWatcher?: boolean;
  state?: SessionState;
  log?: boolean;
  bindHost?: string;
  mobile?: boolean;
  mobileServiceName?: string;
  publishMdns?: boolean;
  mobilePairingManager?: MobilePairingManager;
  mobileQrOutput?: boolean;
  autoStartMobilePairing?: boolean;
};

export type ServerHandle = {
  port: number;
  ready: Promise<number>;
  close: () => Promise<void>;
};

export function startServer(
  port: number = DEFAULT_PORT,
  options?: ServerOptions
): ServerHandle {
  const stateInstance = options?.state ?? defaultState;
  const startWatcher = options?.startWatcher ?? true;
  const logBanner = options?.log ?? true;
  const mobileEnabled = options?.mobile ?? true;
  const bindHost = options?.bindHost ?? (mobileEnabled ? "0.0.0.0" : "127.0.0.1");
  const mobileServiceName = options?.mobileServiceName ?? "Codex Blocker";
  const publishMdns = options?.publishMdns ?? mobileEnabled;
  const mobileQrOutput = options?.mobileQrOutput ?? true;
  const autoStartMobilePairing = options?.autoStartMobilePairing ?? true;
  const mobileInstanceId = createServerInstanceId();

  let authToken: string | null = null;
  let activePort = port;
  let mdnsService: MdnsServiceHandle | null = null;

  const mobilePairing = mobileEnabled
    ? options?.mobilePairingManager ??
      new MobilePairingManager((message) => {
        if (logBanner) {
          console.log(message);
        }
      })
    : null;

  const printPairingQr = (host: string, portToUse: number, qrNonce: string, qrExpiresAt: number) => {
    if (!logBanner || !mobileQrOutput) return;
    const payload = encodePairingQrPayload({
      host,
      port: portToUse,
      instanceId: mobileInstanceId,
      qrNonce,
      expiresAt: qrExpiresAt,
    });
    void renderPairingQr(payload)
      .then((terminalQr) => {
        console.log(
          `[Codex Blocker] Scan this QR in the mobile app (expires in 60 seconds):\n${terminalQr}\n`
        );
      })
      .catch((error) => {
        console.warn(
          `[Codex Blocker] Failed to render pairing QR: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      });
  };

  const server = createServer(async (req, res) => {
    const clientIp = getClientIp(req);
    if (!checkRateLimit(clientIp)) {
      sendJson(res, { error: "Too Many Requests" }, 429);
      return;
    }

    const url = new URL(req.url || "/", `http://localhost:${activePort}`);
    const origin = req.headers.origin;
    const allowExtensionOrigin = isTrustedChromeExtensionOrigin(origin);

    if (allowExtensionOrigin && origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, X-Codex-Blocker-Token"
      );
    }

    if (req.method === "OPTIONS") {
      res.writeHead(allowExtensionOrigin ? 204 : 403);
      res.end();
      return;
    }

    if (mobilePairing) {
      if (req.method === "GET" && url.pathname === "/mobile/discovery") {
        const pairingStatus = mobilePairing.getStatus();
        const payload: MobileDiscoveryResponse = {
          name: mobileServiceName,
          instanceId: mobileInstanceId,
          port: activePort,
          pairingRequired: !authToken,
          pairingExpiresAt: pairingStatus.expiresAt,
        };
        sendJson(res, payload);
        return;
      }

      if (req.method === "POST" && url.pathname === "/mobile/pair/start") {
        const pairingCode = mobilePairing.startPairing();
        const rawHost = getResponseHost(req, bindHost, activePort);
        const hostInfo = splitHostAndPort(rawHost, activePort);
        printPairingQr(
          hostInfo.host,
          hostInfo.port,
          pairingCode.qrNonce,
          pairingCode.qrExpiresAt
        );
        const payload: MobilePairStartResponse = {
          expiresAt: pairingCode.expiresAt,
          qrExpiresAt: pairingCode.qrExpiresAt,
          qrFormat: PAIRING_QR_FORMAT,
        };
        sendJson(res, payload);
        return;
      }

      if (req.method === "POST" && url.pathname === "/mobile/pair/confirm") {
        if (!canAttemptPairConfirm(clientIp)) {
          sendJson(res, { error: "Too Many Requests" }, 429);
          return;
        }

        const body = await readJsonBody(req);
        if (body === INVALID_JSON_SENTINEL) {
          sendJson(res, { error: "Invalid JSON" }, 400);
          return;
        }

        const confirmBody = body as Partial<MobilePairConfirmRequest>;
        const code = typeof confirmBody.code === "string" ? confirmBody.code.trim() : "";
        const qrNonce =
          typeof confirmBody.qrNonce === "string" ? confirmBody.qrNonce.trim() : "";

        const hasCode = code.length > 0;
        const hasQrNonce = qrNonce.length > 0;
        if (hasCode === hasQrNonce) {
          sendJson(res, { error: "Provide exactly one pairing credential" }, 400);
          return;
        }

        const confirmed = hasCode
          ? mobilePairing.confirmPairingCode(code)
          : mobilePairing.confirmPairingQrNonce(qrNonce);
        if (!confirmed) {
          recordPairConfirmFailure(clientIp);
          sendJson(
            res,
            { error: hasCode ? "Invalid or expired pairing code" : "Invalid or expired QR nonce" },
            401
          );
          return;
        }

        clearPairConfirmFailures(clientIp);

        if (!authToken) {
          authToken = createAuthToken();
        }

        const host = getResponseHost(req, bindHost, activePort);
        const payload: MobilePairConfirmResponse = {
          token: authToken,
          statusUrl: `http://${host}/status`,
          wsUrl: `ws://${host}/ws`,
        };
        sendJson(res, payload);
        return;
      }
    }

    const providedToken = readAuthToken(req, url);
    if (authToken) {
      if (!providedToken || providedToken !== authToken) {
        sendJson(res, { error: "Unauthorized" }, 401);
        return;
      }
    } else {
      sendJson(res, { error: "Unauthorized" }, 401);
      return;
    }

    if (req.method === "GET" && url.pathname === "/status") {
      sendJson(res, stateInstance.getStatus());
      return;
    }

    sendJson(res, { error: "Not found" }, 404);
  });

  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws: WebSocket, req) => {
    const wsUrl = new URL(req.url || "", `http://localhost:${activePort}`);
    const providedToken = readWebSocketAuthToken(req, wsUrl);
    const clientIp = getClientIp(req);

    const currentConnections = wsConnectionsByIp.get(clientIp) ?? 0;
    if (currentConnections >= MAX_WS_CONNECTIONS_PER_IP) {
      ws.close(1013, "Too many connections");
      return;
    }

    if (authToken) {
      if (!providedToken || providedToken !== authToken) {
        ws.close(1008, "Unauthorized");
        return;
      }
    } else {
      ws.close(1008, "Unauthorized");
      return;
    }

    wsConnectionsByIp.set(clientIp, currentConnections + 1);

    const unsubscribe = stateInstance.subscribe((message) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    });

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString()) as ClientMessage;
        if (message.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
        }
      } catch {
        // Ignore invalid messages
      }
    });

    ws.on("close", () => {
      unsubscribe();
      decrementWsConnectionCount(clientIp);
    });

    ws.on("error", () => {
      unsubscribe();
      decrementWsConnectionCount(clientIp);
    });
  });

  const codexWatcher = new CodexSessionWatcher(stateInstance, {
    sessionsDir: options?.sessionsDir,
  });

  if (startWatcher) {
    codexWatcher.start();
  }

  let resolveReady: (value: number) => void = () => {};
  const ready = new Promise<number>((resolve) => {
    resolveReady = resolve;
  });

  const handle: ServerHandle = {
    port,
    ready,
    close: async () => {
      stateInstance.destroy();
      codexWatcher.stop();
      if (mdnsService) {
        await mdnsService.stop();
        mdnsService = null;
      }
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };

  server.listen(port, bindHost, () => {
    const address = server.address();
    const actualPort = typeof address === "object" && address ? address.port : port;
    handle.port = actualPort;
    activePort = actualPort;
    resolveReady(actualPort);

    if (mobilePairing && autoStartMobilePairing) {
      const pairingCode = mobilePairing.startPairing();
      printPairingQr(
        "codex-blocker.local",
        actualPort,
        pairingCode.qrNonce,
        pairingCode.qrExpiresAt
      );
      if (publishMdns) {
        try {
          mdnsService = publishMobileService({
            name: mobileServiceName,
            type: MOBILE_SERVICE_TYPE,
            port: actualPort,
            instanceId: mobileInstanceId,
          });
        } catch (error) {
          if (logBanner) {
            console.warn(
              `[Codex Blocker] Failed to publish mDNS service: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
          }
        }
      }
    }

    if (!logBanner) return;

    const displayHost = bindHost === "0.0.0.0" ? "localhost" : bindHost;
    const mobileLine = !mobileEnabled
      ? "│   Mobile:    disabled                     │"
      : mobileQrOutput
        ? `│   Mobile:    enabled (${mobileServiceName})  │`
        : "│   Mobile:    extension-only              │";

    console.log(`
┌─────────────────────────────────────┐
│                                     │
│   Codex Blocker Server              │
│                                     │
│   HTTP:      http://${displayHost}:${actualPort}  │
│   WebSocket: ws://${displayHost}:${actualPort}/ws │
${mobileLine}
│                                     │
│   Watching Codex sessions...        │
│                                     │
└─────────────────────────────────────┘
`);
  });

  process.once("SIGINT", () => {
    if (logBanner) {
      console.log("\nShutting down...");
    }
    void handle.close().then(() => process.exit(0));
  });

  return handle;
}
