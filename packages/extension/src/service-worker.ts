import { applyOverrides, computeShouldBlock } from "./lib/blocking.js";

export {};

const SERVER_HTTP_BASE = "http://localhost:8765";
const WS_URL_BASE = "ws://localhost:8765/ws";
const KEEPALIVE_INTERVAL = 20_000;
const RECONNECT_BASE_DELAY = 1_000;
const RECONNECT_MAX_DELAY = 30_000;
const WS_TOKEN_PROTOCOL_PREFIX = "codex-blocker-token.";
const SESSION_TOKEN_STORAGE_KEY = "sessionAuthToken";
const PHRASE_SEED_KEY = "phraseSeed";
const DISCONNECT_GRACE_MS = 10_000;

type PairStartResponse = {
  expiresAt: number;
};

type PairConfirmResponse = {
  token: string;
};

type PairConfirmErrorResponse = {
  error?: string;
  code?: string;
  retryAfterMs?: number;
};

type ConnectionPhase =
  | "pairing"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "offline";

interface State {
  enabled: boolean;
  pauseMedia: boolean;
  forceBlock: boolean;
  forceOpen: boolean;
  serverConnected: boolean;
  sessions: number;
  working: number;
  waitingForInput: number;
  bypassUntil: number | null;
  pairingRequired: boolean;
  pairingExpiresAt: number | null;
  connectionPhase: ConnectionPhase;
  connectionMessage: string;
}

const state: State = {
  enabled: true,
  pauseMedia: true,
  forceBlock: false,
  forceOpen: false,
  serverConnected: false,
  sessions: 0,
  working: 0,
  waitingForInput: 0,
  bypassUntil: null,
  pairingRequired: true,
  pairingExpiresAt: null,
  connectionPhase: "pairing",
  connectionMessage: "Enter the 6-digit code from your terminal.",
};

const storageSession = (
  chrome.storage as typeof chrome.storage & {
    session?: chrome.storage.StorageArea;
  }
).session;

let websocket: WebSocket | null = null;
let keepaliveInterval: ReturnType<typeof setInterval> | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let retryCount = 0;
let authToken: string | null = null;
let volatileSessionToken: string | null = null;
let phraseSeed: number | null = null;
let phraseSeedPromise: Promise<number> | null = null;
let lastDisconnectAt: number | null = null;
const statePorts = new Set<chrome.runtime.Port>();

chrome.storage.sync.get(
  ["bypassUntil", "enabled", "pauseMedia", "forceBlock", "forceOpen"],
  (result) => {
    if (result.bypassUntil && result.bypassUntil > Date.now()) {
      state.bypassUntil = result.bypassUntil;
    }
    if (typeof result.pauseMedia === "boolean") {
      state.pauseMedia = result.pauseMedia;
    }
    if (typeof result.forceBlock === "boolean") {
      state.forceBlock = result.forceBlock;
    }
    if (typeof result.forceOpen === "boolean") {
      state.forceOpen = result.forceOpen;
    } else if (typeof result.enabled === "boolean") {
      state.forceOpen = !result.enabled;
    }
    broadcast();
  }
);

function ensurePhraseSeed(): Promise<number> {
  if (phraseSeed !== null) return Promise.resolve(phraseSeed);
  if (phraseSeedPromise) return phraseSeedPromise;

  phraseSeedPromise = new Promise((resolve) => {
    chrome.storage.local.get([PHRASE_SEED_KEY], (result) => {
      const stored = result[PHRASE_SEED_KEY];
      if (typeof stored === "number") {
        phraseSeed = stored;
        phraseSeedPromise = null;
        resolve(stored);
        return;
      }

      const bytes = new Uint32Array(1);
      crypto.getRandomValues(bytes);
      const seed = bytes[0] ?? Date.now();
      phraseSeed = seed;
      chrome.storage.local.set({ [PHRASE_SEED_KEY]: seed }, () => {
        phraseSeedPromise = null;
        resolve(seed);
      });
    });
  });

  return phraseSeedPromise;
}

function loadSessionToken(): Promise<string | null> {
  if (!storageSession) {
    return Promise.resolve(volatileSessionToken);
  }
  return new Promise((resolve) => {
    storageSession.get([SESSION_TOKEN_STORAGE_KEY], (result) => {
      const token = result[SESSION_TOKEN_STORAGE_KEY];
      resolve(typeof token === "string" && token.length > 0 ? token : null);
    });
  });
}

function saveSessionToken(token: string): Promise<void> {
  if (!storageSession) {
    volatileSessionToken = token;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    storageSession.set({ [SESSION_TOKEN_STORAGE_KEY]: token }, () => resolve());
  });
}

function clearSessionToken(): Promise<void> {
  if (!storageSession) {
    volatileSessionToken = null;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    storageSession.remove(SESSION_TOKEN_STORAGE_KEY, () => resolve());
  });
}

function buildWsProtocols(): string[] | undefined {
  if (!authToken) return undefined;
  return ["codex-blocker.v1", `${WS_TOKEN_PROTOCOL_PREFIX}${authToken}`];
}

function setConnectionPhase(phase: ConnectionPhase, message: string): void {
  state.connectionPhase = phase;
  state.connectionMessage = message;
}

function getPublicState() {
  const bypassActive = state.bypassUntil !== null && state.bypassUntil > Date.now();
  const now = Date.now();
  const withinGrace =
    !state.serverConnected &&
    !state.pairingRequired &&
    lastDisconnectAt !== null &&
    now - lastDisconnectAt < DISCONNECT_GRACE_MS;
  const serverConnected = state.serverConnected || withinGrace;
  const shouldBlock = computeShouldBlock({
    bypassActive,
    serverConnected,
    sessions: state.sessions,
    working: state.working,
    waitingForInput: state.waitingForInput,
  });
  const effectiveBlocked = applyOverrides(shouldBlock, state.forceOpen, state.forceBlock);

  return {
    forceOpen: state.forceOpen,
    pauseMedia: state.pauseMedia,
    forceBlock: state.forceBlock,
    serverConnected,
    transportConnected: state.serverConnected,
    sessions: state.sessions,
    working: state.working,
    waitingForInput: state.waitingForInput,
    blocked: effectiveBlocked,
    bypassActive,
    bypassUntil: state.bypassUntil,
    pairingRequired: state.pairingRequired,
    pairingExpiresAt: state.pairingExpiresAt,
    connectionPhase: state.connectionPhase,
    connectionMessage: state.connectionMessage,
  };
}

function broadcast() {
  const publicState = getPublicState();
  for (const port of statePorts) {
    try {
      port.postMessage({ type: "STATE", ...publicState });
    } catch {
      statePorts.delete(port);
    }
  }
  chrome.runtime.sendMessage({ type: "STATE", ...publicState }).catch(() => {});
}

function stopKeepalive() {
  if (keepaliveInterval) {
    clearInterval(keepaliveInterval);
    keepaliveInterval = null;
  }
}

function startKeepalive() {
  stopKeepalive();
  keepaliveInterval = setInterval(() => {
    if (websocket?.readyState === WebSocket.OPEN) {
      websocket.send(JSON.stringify({ type: "ping" }));
    }
  }, KEEPALIVE_INTERVAL);
}

function clearReconnectTimer() {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
}

function teardownSocket() {
  if (!websocket) return;
  websocket.onopen = null;
  websocket.onmessage = null;
  websocket.onclose = null;
  websocket.onerror = null;
  try {
    websocket.close();
  } catch {
    // ignore close errors
  }
  websocket = null;
}

type PairStartRequest = {
  regenerateCode?: boolean;
  refreshQr?: boolean;
};

async function requestPairingWindow(request: PairStartRequest = {}): Promise<number | null> {
  try {
    const response = await fetch(`${SERVER_HTTP_BASE}/mobile/pair/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as PairStartResponse;
    return typeof payload.expiresAt === "number" ? payload.expiresAt : null;
  } catch {
    return null;
  }
}

async function enterPairingMode(reason?: string): Promise<void> {
  if (reason) {
    console.warn(`[Codex Blocker] ${reason}`);
  }

  clearReconnectTimer();
  stopKeepalive();
  teardownSocket();
  state.serverConnected = false;
  lastDisconnectAt = Date.now();
  retryCount = 0;
  authToken = null;
  await clearSessionToken();

  state.pairingRequired = true;
  const expiresAt = await requestPairingWindow({ refreshQr: false });
  state.pairingExpiresAt = expiresAt;
  setConnectionPhase(
    "pairing",
    expiresAt
      ? "Pairing required. Enter the latest terminal code."
      : "Pairing required. Could not reach server to refresh code."
  );
  broadcast();
}

function scheduleReconnect() {
  if (!authToken || state.pairingRequired) return;
  setConnectionPhase("reconnecting", "Connection lost. Reconnecting to server...");
  clearReconnectTimer();
  const delay = Math.min(RECONNECT_BASE_DELAY * Math.pow(2, retryCount), RECONNECT_MAX_DELAY);
  retryCount += 1;
  reconnectTimeout = setTimeout(() => {
    void connect();
  }, delay);
}

async function connect() {
  if (!authToken || state.pairingRequired) {
    return;
  }
  if (websocket?.readyState === WebSocket.OPEN) return;
  if (websocket?.readyState === WebSocket.CONNECTING) return;

  try {
    if (retryCount === 0) {
      setConnectionPhase("connecting", "Connecting to server...");
      broadcast();
    }
    const protocols = buildWsProtocols();
    websocket = protocols ? new WebSocket(WS_URL_BASE, protocols) : new WebSocket(WS_URL_BASE);

    websocket.onopen = () => {
      console.log("[Codex Blocker] Connected");
      state.serverConnected = true;
      lastDisconnectAt = null;
      retryCount = 0;
      setConnectionPhase("connected", "Connected to codex-blocker server.");
      startKeepalive();
      broadcast();
    };

    websocket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "state") {
          state.sessions = msg.sessions;
          state.working = msg.working;
          state.waitingForInput = msg.waitingForInput ?? 0;
          broadcast();
        }
      } catch {
        // ignore invalid payloads
      }
    };

    websocket.onclose = (event) => {
      state.serverConnected = false;
      lastDisconnectAt = Date.now();
      stopKeepalive();
      websocket = null;

      if (event.code === 1008) {
        void enterPairingMode("Server rejected extension auth. Enter the latest pairing code.");
        return;
      }

      setConnectionPhase("reconnecting", "Connection lost. Reconnecting to server...");
      broadcast();
      scheduleReconnect();
    };

    websocket.onerror = () => {
      state.serverConnected = false;
      lastDisconnectAt = Date.now();
      stopKeepalive();
      setConnectionPhase("reconnecting", "Connection error. Retrying...");
    };
  } catch {
    setConnectionPhase("offline", "Unable to open websocket. Server may be offline.");
    broadcast();
    scheduleReconnect();
  }
}

async function confirmPairingCode(rawCode: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const code = rawCode.trim();
  if (!/^\d{6}$/.test(code)) {
    return { ok: false, error: "Enter a 6-digit code." };
  }

  let response: Response;
  try {
    response = await fetch(`${SERVER_HTTP_BASE}/mobile/pair/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
  } catch {
    return { ok: false, error: "Could not reach codex-blocker server." };
  }

  if (!response.ok) {
    if (response.status === 429) {
      let retryAfterMs: number | null = null;
      try {
        const payload = (await response.json()) as PairConfirmErrorResponse;
        retryAfterMs =
          typeof payload.retryAfterMs === "number" && payload.retryAfterMs > 0
            ? payload.retryAfterMs
            : null;
      } catch {
        retryAfterMs = null;
      }
      const seconds = retryAfterMs ? Math.max(1, Math.ceil(retryAfterMs / 1_000)) : null;
      const waitHint = seconds
        ? `Wait about ${seconds} seconds, then try again.`
        : "Wait 2 minutes, then try again.";
      return {
        ok: false,
        error: `Too many incorrect attempts. ${waitHint}`,
      };
    }
    return { ok: false, error: "Invalid or expired code. Start pairing again in terminal." };
  }

  const payload = (await response.json()) as PairConfirmResponse;
  if (!payload.token) {
    return { ok: false, error: "Server did not return an auth token." };
  }

  authToken = payload.token;
  await saveSessionToken(payload.token);

  state.pairingRequired = false;
  state.pairingExpiresAt = null;
  lastDisconnectAt = null;
  setConnectionPhase("connecting", "Pairing accepted. Connecting...");
  clearReconnectTimer();
  teardownSocket();
  broadcast();

  void connect();
  return { ok: true };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "GET_STATE") {
    sendResponse(getPublicState());
    return true;
  }

  if (message.type === "START_PAIRING") {
    void (async () => {
      const expiresAt = await requestPairingWindow({ regenerateCode: true, refreshQr: true });
      state.pairingRequired = true;
      state.pairingExpiresAt = expiresAt;
      setConnectionPhase(
        "pairing",
        expiresAt
          ? "Use the latest terminal code to pair this extension."
          : "Could not reach server to start pairing."
      );
      broadcast();
      if (expiresAt === null) {
        sendResponse({ success: false, error: "Could not start pairing on server." });
        return;
      }
      sendResponse({ success: true, expiresAt });
    })();
    return true;
  }

  if (message.type === "CONFIRM_PAIRING") {
    void (async () => {
      const result = await confirmPairingCode(String(message.code ?? ""));
      if (!result.ok) {
        sendResponse({ success: false, error: result.error });
        return;
      }
      sendResponse({ success: true });
    })();
    return true;
  }

  if (message.type === "SET_ENABLED") {
    state.enabled = Boolean(message.enabled);
    state.forceOpen = !state.enabled;
    chrome.storage.sync.set({ forceOpen: state.forceOpen }, () => {
      broadcast();
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === "SET_PAUSE_MEDIA") {
    state.pauseMedia = Boolean(message.pauseMedia);
    chrome.storage.sync.set({ pauseMedia: state.pauseMedia }, () => {
      broadcast();
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === "SET_FORCE_BLOCK") {
    state.forceBlock = Boolean(message.forceBlock);
    chrome.storage.sync.set({ forceBlock: state.forceBlock }, () => {
      broadcast();
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === "SET_FORCE_OPEN") {
    state.forceOpen = Boolean(message.forceOpen);
    chrome.storage.sync.set({ forceOpen: state.forceOpen }, () => {
      broadcast();
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === "ACTIVATE_BYPASS") {
    const today = new Date().toDateString();
    chrome.storage.sync.get(["lastBypassDate"], (result) => {
      if (result.lastBypassDate === today) {
        sendResponse({ success: false, reason: "Already used today" });
        return;
      }
      state.bypassUntil = Date.now() + 5 * 60 * 1000;
      chrome.storage.sync.set({ bypassUntil: state.bypassUntil, lastBypassDate: today });
      broadcast();
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === "GET_BYPASS_STATUS") {
    const today = new Date().toDateString();
    chrome.storage.sync.get(["lastBypassDate"], (result) => {
      sendResponse({
        usedToday: result.lastBypassDate === today,
        bypassActive: state.bypassUntil !== null && state.bypassUntil > Date.now(),
        bypassUntil: state.bypassUntil,
      });
    });
    return true;
  }

  if (message.type === "GET_PHRASE_SEED") {
    ensurePhraseSeed().then((seed) => sendResponse({ seed }));
    return true;
  }

  return false;
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "state") return;
  statePorts.add(port);

  port.onMessage.addListener((message) => {
    if (message?.type === "GET_STATE") {
      port.postMessage({ type: "STATE", ...getPublicState() });
    }
  });

  port.onDisconnect.addListener(() => {
    statePorts.delete(port);
  });

  port.postMessage({ type: "STATE", ...getPublicState() });
});

setInterval(() => {
  if (state.bypassUntil && state.bypassUntil <= Date.now()) {
    state.bypassUntil = null;
    chrome.storage.sync.remove("bypassUntil");
    broadcast();
  }
}, 5000);

void (async () => {
  authToken = await loadSessionToken();
  if (authToken) {
    state.pairingRequired = false;
    state.pairingExpiresAt = null;
    setConnectionPhase("connecting", "Restoring extension session...");
    broadcast();
    void connect();
    return;
  }

  await enterPairingMode();
})();
