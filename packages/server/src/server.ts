import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
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
  createServerToken,
} from "./mobile.js";
import { publishMobileService, type MdnsServiceHandle } from "./mdns.js";

const DEFAULT_TOKEN_DIR = join(homedir(), ".codex-blocker");
const DEFAULT_TOKEN_PATH = join(DEFAULT_TOKEN_DIR, "token");
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 60;
const MAX_WS_CONNECTIONS_PER_IP = 3;
const MOBILE_SERVICE_TYPE = "codex-blocker";

const INVALID_JSON_SENTINEL = Symbol("invalid-json");

type JsonBody = Record<string, unknown> | typeof INVALID_JSON_SENTINEL;
type RateState = { count: number; resetAt: number };

const rateByIp = new Map<string, RateState>();
const wsConnectionsByIp = new Map<string, number>();

function loadToken(tokenPath: string): string | null {
  if (!existsSync(tokenPath)) return null;
  try {
    return readFileSync(tokenPath, "utf-8").trim() || null;
  } catch {
    return null;
  }
}

function saveToken(tokenPath: string, token: string): void {
  const tokenDir = dirname(tokenPath);
  if (!existsSync(tokenDir)) {
    mkdirSync(tokenDir, { recursive: true });
  }
  writeFileSync(tokenPath, token, "utf-8");
}

function isChromeExtensionOrigin(origin?: string | null): boolean {
  return Boolean(origin && origin.startsWith("chrome-extension://"));
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

export type ServerOptions = {
  sessionsDir?: string;
  startWatcher?: boolean;
  tokenPath?: string;
  state?: SessionState;
  log?: boolean;
  bindHost?: string;
  mobile?: boolean;
  mobileServiceName?: string;
  publishMdns?: boolean;
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
  const tokenPath = options?.tokenPath ?? DEFAULT_TOKEN_PATH;
  const startWatcher = options?.startWatcher ?? true;
  const logBanner = options?.log ?? true;
  const mobileEnabled = options?.mobile ?? false;
  const bindHost = options?.bindHost ?? (mobileEnabled ? "0.0.0.0" : "127.0.0.1");
  const mobileServiceName = options?.mobileServiceName ?? "Codex Blocker";
  const publishMdns = options?.publishMdns ?? mobileEnabled;
  const mobileInstanceId = createServerInstanceId();

  let authToken = loadToken(tokenPath);
  let activePort = port;
  let mdnsService: MdnsServiceHandle | null = null;

  const mobilePairing = mobileEnabled
    ? new MobilePairingManager((message) => {
        if (logBanner) {
          console.log(message);
        }
      })
    : null;

  const server = createServer(async (req, res) => {
    const clientIp = getClientIp(req);
    if (!checkRateLimit(clientIp)) {
      sendJson(res, { error: "Too Many Requests" }, 429);
      return;
    }

    const url = new URL(req.url || "/", `http://localhost:${activePort}`);
    const origin = req.headers.origin;
    const allowExtensionOrigin = isChromeExtensionOrigin(origin);

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
        const payload: MobilePairStartResponse = {
          code: pairingCode.code,
          expiresAt: pairingCode.expiresAt,
        };
        sendJson(res, payload);
        return;
      }

      if (req.method === "POST" && url.pathname === "/mobile/pair/confirm") {
        const body = await readJsonBody(req);
        if (body === INVALID_JSON_SENTINEL) {
          sendJson(res, { error: "Invalid JSON" }, 400);
          return;
        }

        const code = (body as Partial<MobilePairConfirmRequest>).code;
        if (typeof code !== "string" || code.trim().length === 0) {
          sendJson(res, { error: "Missing pairing code" }, 400);
          return;
        }

        const confirmed = mobilePairing.confirmPairing(code);
        if (!confirmed) {
          sendJson(res, { error: "Invalid or expired pairing code" }, 401);
          return;
        }

        if (!authToken) {
          authToken = createServerToken();
          saveToken(tokenPath, authToken);
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
    } else if (providedToken && allowExtensionOrigin) {
      authToken = providedToken;
      saveToken(tokenPath, providedToken);
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
    const providedToken = wsUrl.searchParams.get("token");
    const origin = req.headers.origin;
    const allowOrigin = isChromeExtensionOrigin(origin);
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
    } else if (providedToken && allowOrigin) {
      authToken = providedToken;
      saveToken(tokenPath, providedToken);
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
      wsConnectionsByIp.set(
        clientIp,
        Math.max(0, (wsConnectionsByIp.get(clientIp) ?? 1) - 1)
      );
    });

    ws.on("error", () => {
      unsubscribe();
      wsConnectionsByIp.set(
        clientIp,
        Math.max(0, (wsConnectionsByIp.get(clientIp) ?? 1) - 1)
      );
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

    if (mobilePairing) {
      mobilePairing.startPairing();
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
    const mobileLine = mobileEnabled
      ? `│   Mobile:    enabled (${mobileServiceName})  │`
      : "│   Mobile:    disabled                     │";

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
