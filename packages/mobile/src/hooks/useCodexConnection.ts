import { useCallback, useEffect, useRef, useState } from "react";
import type { CodexStatus, ConnectionPhase } from "../types";
import { discoverServer } from "../lib/discovery";
import {
  fetchDiscovery,
  buildWsProtocols,
  confirmPairingQr,
  fetchStatus,
  parseStateMessage,
  startPairing,
  buildWsUrl,
} from "../lib/server";
import { clearConnection, loadConnection, saveConnection } from "../lib/storage";
import { shouldTrustDiscoveredInstance } from "../lib/trust";
import { parsePairingQrPayload } from "../lib/pairing-qr";

const RECONNECT_BASE_DELAY_MS = 1_000;
const RECONNECT_MAX_DELAY_MS = 20_000;
const QR_EXPIRED_NOTICE = "QR expired. Tap Refresh QR to generate a new one.";

const EMPTY_STATUS: CodexStatus = {
  blocked: true,
  sessions: 0,
  working: 0,
  waitingForInput: 0,
};

type HookState = {
  phase: ConnectionPhase;
  status: CodexStatus;
  host: string | null;
  error: string | null;
  lastUpdatedAt: number | null;
  pairingExpiresAt: number | null;
  qrExpiresAt: number | null;
  pairingNotice: string | null;
};

type WebSocketHandle = {
  close: () => void;
};

function formatHostLabel(host: string, port: number): string {
  return port === 8765 ? host : `${host}:${port}`;
}

function sameStatus(a: CodexStatus, b: CodexStatus): boolean {
  return (
    a.blocked === b.blocked &&
    a.sessions === b.sessions &&
    a.working === b.working &&
    a.waitingForInput === b.waitingForInput
  );
}

function connectRealtimeSocket(
  host: string,
  port: number,
  token: string,
  onState: (status: CodexStatus) => void,
  onSocketReady: () => void,
  onReconnecting: () => void,
  onAuthInvalidated: () => void
): WebSocketHandle {
  let websocket: WebSocket | null = null;
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  let retries = 0;
  let closing = false;

  const connect = () => {
    if (closing) return;

    websocket = new WebSocket(buildWsUrl(host, port), buildWsProtocols(token));

    websocket.onopen = () => {
      retries = 0;
      onSocketReady();
    };

    websocket.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      const parsed = parseStateMessage(event.data);
      if (parsed) {
        onState(parsed);
      }
    };

    websocket.onclose = (event) => {
      if (closing) return;
      if ((event as { code?: number }).code === 1008) {
        onAuthInvalidated();
        return;
      }
      onReconnecting();
      const delay = Math.min(
        RECONNECT_BASE_DELAY_MS * Math.pow(2, retries),
        RECONNECT_MAX_DELAY_MS
      );
      retries += 1;
      reconnectTimeout = setTimeout(connect, delay);
    };

    websocket.onerror = () => {
      // onclose handles reconnect strategy.
    };
  };

  connect();

  return {
    close: () => {
      closing = true;
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
      if (websocket) {
        websocket.close();
        websocket = null;
      }
    },
  };
}

export function useCodexConnection() {
  const [
    { phase, status, host, error, lastUpdatedAt, pairingExpiresAt, qrExpiresAt, pairingNotice },
    setState,
  ] = useState<HookState>({
    phase: "booting",
    status: EMPTY_STATUS,
    host: null,
    error: null,
    lastUpdatedAt: null,
    pairingExpiresAt: null,
    qrExpiresAt: null,
    pairingNotice: null,
  });
  const socketRef = useRef<WebSocketHandle | null>(null);
  const sessionTokenRef = useRef<string | null>(null);
  const pairingRef = useRef<{
    host: string;
    port: number;
    expiresAt: number;
    qrExpiresAt: number;
    instanceId: string;
  } | null>(null);
  const qrExpiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearQrExpiryTimer = useCallback(() => {
    if (qrExpiryTimerRef.current) {
      clearTimeout(qrExpiryTimerRef.current);
      qrExpiryTimerRef.current = null;
    }
  }, []);

  const closeSocket = useCallback(() => {
    socketRef.current?.close();
    socketRef.current = null;
  }, []);

  const setConnecting = useCallback(() => {
    setState((current) => ({
      ...current,
      phase: current.phase === "error" ? "error" : "connecting",
    }));
  }, []);

  const beginPairing = useCallback(
    async (
      hostToPair: string,
      portToPair: number,
      instanceId: string,
      errorMessage: string | null
    ) => {
      setState((current) => ({
        ...current,
        phase: "pairing",
        host: formatHostLabel(hostToPair, portToPair),
        error: errorMessage,
        pairingNotice: null,
      }));

      const pairing = await startPairing(hostToPair, portToPair, { refreshQr: false });
      pairingRef.current = {
        host: hostToPair,
        port: portToPair,
        expiresAt: pairing.expiresAt,
        qrExpiresAt: pairing.qrExpiresAt,
        instanceId,
      };
      setState((current) => ({
        ...current,
        phase: "pairing",
        host: formatHostLabel(hostToPair, portToPair),
        error: errorMessage,
        pairingExpiresAt: pairing.expiresAt,
        qrExpiresAt: pairing.qrExpiresAt,
        pairingNotice: null,
      }));
    },
    []
  );

  const pairAfterAuthFailure = useCallback(
    async (preferredHost?: string, preferredPort?: number) => {
      closeSocket();
      pairingRef.current = null;
      sessionTokenRef.current = null;
      await clearConnection();

      setState((current) => ({
        ...current,
        phase: "discovering",
        error: "Connection expired. Re-pair by scanning the latest terminal QR.",
        pairingExpiresAt: null,
        qrExpiresAt: null,
        pairingNotice: null,
      }));

      const discovered =
        (preferredHost
          ? await fetchDiscovery(preferredHost, preferredPort ?? undefined)
          : null) ??
        (await discoverServer(preferredHost, preferredPort));
      if (!discovered) {
        setState((current) => ({
          ...current,
          phase: "error",
          error: "Could not rediscover codex-blocker on this Wi-Fi network.",
          pairingExpiresAt: null,
          qrExpiresAt: null,
          pairingNotice: null,
        }));
        return;
      }

      await beginPairing(
        discovered.host,
        discovered.port,
        discovered.info.instanceId,
        "Server session reset. Scan the new terminal QR to trust this server."
      );
    },
    [beginPairing, closeSocket]
  );

  const connectWithToken = useCallback(
    async (nextHost: string, nextPort: number, token: string): Promise<boolean> => {
      setState((current) => ({
        ...current,
        phase: "connecting",
        host: formatHostLabel(nextHost, nextPort),
        error: null,
        pairingExpiresAt: null,
        qrExpiresAt: null,
        pairingNotice: null,
      }));

      const initialStatus = await fetchStatus(nextHost, token, nextPort);
      if (!initialStatus) {
        return false;
      }

      setState((current) => ({
        ...current,
        phase: "connected",
        status: initialStatus,
        host: formatHostLabel(nextHost, nextPort),
        error: null,
        lastUpdatedAt: Date.now(),
        pairingExpiresAt: null,
        qrExpiresAt: null,
        pairingNotice: null,
      }));
      pairingRef.current = null;
      sessionTokenRef.current = token;
      clearQrExpiryTimer();

      closeSocket();
      socketRef.current = connectRealtimeSocket(
        nextHost,
        nextPort,
        token,
        (nextStatus) => {
          setState((current) => {
            if (sameStatus(current.status, nextStatus) && current.phase === "connected") {
              return current;
            }
            return {
              ...current,
              phase: "connected",
              status: nextStatus,
              lastUpdatedAt: Date.now(),
            };
          });
        },
        () => {
          setState((current) =>
            current.phase === "connected"
              ? current
              : {
                  ...current,
                  phase: "connected",
                }
          );
        },
        setConnecting,
        () => {
          sessionTokenRef.current = null;
          void pairAfterAuthFailure(nextHost, nextPort);
        }
      );

      return true;
    },
    [clearQrExpiryTimer, closeSocket, pairAfterAuthFailure, setConnecting]
  );

  const bootstrap = useCallback(async () => {
    closeSocket();
    pairingRef.current = null;
    clearQrExpiryTimer();

    try {
      const saved = await loadConnection();
      setState((current) => ({
        ...current,
        phase: "discovering",
        error: null,
        pairingExpiresAt: null,
        qrExpiresAt: null,
        pairingNotice: null,
      }));

      let discovered = saved.host
        ? await fetchDiscovery(saved.host, saved.port ?? undefined)
        : null;
      if (!discovered) {
        discovered = await discoverServer(saved.host ?? undefined, saved.port ?? undefined);
      }
      if (!discovered) {
        setState((current) => ({
          ...current,
          phase: "error",
          error: "Could not discover codex-blocker on this Wi-Fi network.",
          pairingExpiresAt: null,
          qrExpiresAt: null,
          pairingNotice: null,
        }));
        return;
      }

      const trustedServer = shouldTrustDiscoveredInstance(
        saved.instanceId,
        discovered.info.instanceId
      );

      if (!trustedServer) {
        await clearConnection();
        await beginPairing(
          discovered.host,
          discovered.port,
          discovered.info.instanceId,
          "Detected a different Codex Blocker server identity. Scan its terminal QR to trust it."
        );
        return;
      }

      const candidateToken = sessionTokenRef.current;
      if (candidateToken) {
        const connected = await connectWithToken(
          discovered.host,
          discovered.port,
          candidateToken
        );
        if (connected) {
          await saveConnection(
            discovered.host,
            discovered.info.instanceId,
            discovered.port
          );
          return;
        }
        sessionTokenRef.current = null;
        await clearConnection();
      }

      await beginPairing(
        discovered.host,
        discovered.port,
        discovered.info.instanceId,
        null
      );
    } catch (cause) {
      closeSocket();
      const message = cause instanceof Error ? cause.message : "Failed to connect.";
      setState((current) => ({
        ...current,
        phase: "error",
        error: message,
        pairingExpiresAt: null,
        qrExpiresAt: null,
        pairingNotice: null,
      }));
    }
  }, [beginPairing, clearQrExpiryTimer, closeSocket, connectWithToken]);

  const refreshPairing = useCallback(async (): Promise<boolean> => {
    const pending = pairingRef.current;
    if (!pending) {
      setState((current) => ({
        ...current,
        phase: "error",
        error: "No active pairing request. Retry connection first.",
        pairingNotice: null,
      }));
      return false;
    }

    try {
      const refreshed = await startPairing(pending.host, pending.port, { refreshQr: true });
      pairingRef.current = {
        ...pending,
        expiresAt: refreshed.expiresAt,
        qrExpiresAt: refreshed.qrExpiresAt,
      };
      setState((current) => ({
        ...current,
        phase: "pairing",
        host: formatHostLabel(pending.host, pending.port),
        error: null,
        pairingExpiresAt: refreshed.expiresAt,
        qrExpiresAt: refreshed.qrExpiresAt,
        pairingNotice: "QR refreshed. Scan the latest code shown in your terminal.",
      }));
      return true;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Failed to refresh pairing QR.";
      setState((current) => ({
        ...current,
        phase: "pairing",
        host: formatHostLabel(pending.host, pending.port),
        error: message,
        pairingExpiresAt: pending.expiresAt,
        qrExpiresAt: pending.qrExpiresAt,
      }));
      return false;
    }
  }, []);

  const submitPairingQrPayload = useCallback(
    async (rawPayload: string): Promise<boolean> => {
      const pending = pairingRef.current;
      if (!pending) {
        setState((current) => ({
          ...current,
          phase: "error",
          error: "No active pairing request. Retry connection first.",
          pairingNotice: null,
        }));
        return false;
      }

      const parsed = parsePairingQrPayload(rawPayload);
      if (!parsed.ok) {
        setState((current) => ({
          ...current,
          phase: "pairing",
          host: formatHostLabel(pending.host, pending.port),
          error: parsed.error,
          pairingExpiresAt: pending.expiresAt,
          qrExpiresAt: pending.qrExpiresAt,
        }));
        return false;
      }

      const payload = parsed.payload;
      if (payload.expiresAt <= Date.now()) {
        setState((current) => ({
          ...current,
          phase: "pairing",
          host: formatHostLabel(pending.host, pending.port),
          error: null,
          pairingExpiresAt: pending.expiresAt,
          qrExpiresAt: payload.expiresAt,
          pairingNotice: QR_EXPIRED_NOTICE,
        }));
        return false;
      }

      if (payload.instanceId !== pending.instanceId) {
        setState((current) => ({
          ...current,
          phase: "pairing",
          host: formatHostLabel(pending.host, pending.port),
          error:
            "That QR belongs to a different Codex Blocker server instance. Refresh and scan the current server QR.",
          pairingExpiresAt: pending.expiresAt,
          qrExpiresAt: pending.qrExpiresAt,
          pairingNotice: null,
        }));
        return false;
      }

      setState((current) => ({
        ...current,
        phase: "connecting",
        host: formatHostLabel(pending.host, pending.port),
        error: null,
        pairingNotice: null,
      }));

      try {
        const confirmed = await confirmPairingQr(
          pending.host,
          payload.qrNonce,
          pending.port
        );
        await saveConnection(pending.host, pending.instanceId, pending.port);
        const connected = await connectWithToken(
          pending.host,
          pending.port,
          confirmed.token
        );
        if (!connected) {
          throw new Error("Paired successfully, but failed to read server status.");
        }
        return true;
      } catch (cause) {
        const message =
          cause instanceof Error ? cause.message : "Failed to confirm pairing QR.";
        setState((current) => ({
          ...current,
          phase: "pairing",
          host: formatHostLabel(pending.host, pending.port),
          error:
            message === "Unable to confirm mobile pairing."
              ? "Invalid or expired QR. Refresh and scan the latest terminal QR."
              : message,
          pairingExpiresAt: pending.expiresAt,
          qrExpiresAt: pending.qrExpiresAt,
          pairingNotice: null,
        }));
        return false;
      }
    },
    [connectWithToken]
  );

  useEffect(() => {
    clearQrExpiryTimer();
    if (phase !== "pairing" || !qrExpiresAt) {
      return;
    }
    const remaining = qrExpiresAt - Date.now();
    if (remaining <= 0) {
      setState((current) =>
        current.phase === "pairing"
          ? {
              ...current,
              pairingNotice: QR_EXPIRED_NOTICE,
            }
          : current
      );
      return;
    }
    qrExpiryTimerRef.current = setTimeout(() => {
      setState((current) =>
        current.phase === "pairing"
          ? {
              ...current,
              pairingNotice: QR_EXPIRED_NOTICE,
            }
          : current
      );
    }, remaining + 25);
  }, [clearQrExpiryTimer, phase, qrExpiresAt]);

  useEffect(() => {
    void bootstrap();
    return () => {
      closeSocket();
      clearQrExpiryTimer();
    };
  }, [bootstrap, clearQrExpiryTimer, closeSocket]);

  return {
    phase,
    status,
    host,
    error,
    lastUpdatedAt,
    pairingExpiresAt,
    qrExpiresAt,
    pairingNotice,
    qrExpired: phase === "pairing" && qrExpiresAt !== null && qrExpiresAt <= Date.now(),
    reconnect: bootstrap,
    refreshPairing,
    submitPairingQrPayload,
  };
}
