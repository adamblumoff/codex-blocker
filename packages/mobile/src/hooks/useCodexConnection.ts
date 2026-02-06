import { useCallback, useEffect, useRef, useState } from "react";
import type { CodexStatus, ConnectionPhase } from "../types";
import { discoverServer } from "../lib/discovery";
import {
  confirmPairing,
  fetchStatus,
  parseStateMessage,
  startPairing,
  buildWsUrl,
} from "../lib/server";
import { loadConnection, saveConnection } from "../lib/storage";

const RECONNECT_BASE_DELAY_MS = 1_000;
const RECONNECT_MAX_DELAY_MS = 20_000;

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
};

type WebSocketHandle = {
  close: () => void;
};

function connectRealtimeSocket(
  host: string,
  token: string,
  onState: (status: CodexStatus) => void,
  onConnecting: () => void
): WebSocketHandle {
  let websocket: WebSocket | null = null;
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  let retries = 0;
  let closing = false;

  const connect = () => {
    if (closing) return;

    websocket = new WebSocket(buildWsUrl(host, token));

    websocket.onopen = () => {
      retries = 0;
      onConnecting();
    };

    websocket.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      const parsed = parseStateMessage(event.data);
      if (parsed) {
        onState(parsed);
      }
    };

    websocket.onclose = () => {
      if (closing) return;
      onConnecting();
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
  const [{ phase, status, host, error, lastUpdatedAt }, setState] = useState<HookState>({
    phase: "booting",
    status: EMPTY_STATUS,
    host: null,
    error: null,
    lastUpdatedAt: null,
  });
  const socketRef = useRef<WebSocketHandle | null>(null);

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

  const connectWithToken = useCallback(
    async (nextHost: string, token: string): Promise<boolean> => {
      setState((current) => ({
        ...current,
        phase: "connecting",
        host: nextHost,
        error: null,
      }));

      const initialStatus = await fetchStatus(nextHost, token);
      if (!initialStatus) {
        return false;
      }

      setState((current) => ({
        ...current,
        phase: "connected",
        status: initialStatus,
        host: nextHost,
        error: null,
        lastUpdatedAt: Date.now(),
      }));

      closeSocket();
      socketRef.current = connectRealtimeSocket(
        nextHost,
        token,
        (nextStatus) => {
          setState((current) => ({
            ...current,
            phase: "connected",
            status: nextStatus,
            lastUpdatedAt: Date.now(),
          }));
        },
        setConnecting
      );

      return true;
    },
    [closeSocket, setConnecting]
  );

  const bootstrap = useCallback(async () => {
    closeSocket();

    try {
      const saved = await loadConnection();
      if (saved.host && saved.token) {
        const restored = await connectWithToken(saved.host, saved.token);
        if (restored) {
          return;
        }
      }

      setState((current) => ({
        ...current,
        phase: "discovering",
        error: null,
      }));

      const discovered = await discoverServer(saved.host ?? undefined);
      if (!discovered) {
        setState((current) => ({
          ...current,
          phase: "error",
          error: "Could not discover codex-blocker on this Wi-Fi network.",
        }));
        return;
      }

      let activeToken = saved.token;
      if (activeToken) {
        const connected = await connectWithToken(discovered.host, activeToken);
        if (connected) {
          await saveConnection(discovered.host, activeToken);
          return;
        }
      }

      setState((current) => ({
        ...current,
        phase: "pairing",
        host: discovered.host,
        error: null,
      }));

      const pairing = await startPairing(discovered.host, discovered.port);
      const confirmed = await confirmPairing(discovered.host, pairing.code, discovered.port);
      activeToken = confirmed.token;
      await saveConnection(discovered.host, activeToken);

      const connected = await connectWithToken(discovered.host, activeToken);
      if (!connected) {
        throw new Error("Paired successfully, but failed to read server status.");
      }
    } catch (cause) {
      closeSocket();
      const message = cause instanceof Error ? cause.message : "Failed to connect.";
      setState((current) => ({
        ...current,
        phase: "error",
        error: message,
      }));
    }
  }, [closeSocket, connectWithToken]);

  useEffect(() => {
    void bootstrap();
    return () => closeSocket();
  }, [bootstrap, closeSocket]);

  return {
    phase,
    status,
    host,
    error,
    lastUpdatedAt,
    reconnect: bootstrap,
  };
}
