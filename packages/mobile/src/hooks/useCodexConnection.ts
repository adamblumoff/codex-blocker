import { useCallback, useEffect, useRef, useState } from "react";
import type { CodexStatus, ConnectionPhase } from "../types";
import { discoverServer } from "../lib/discovery";
import {
  fetchDiscovery,
  buildWsProtocols,
  confirmPairing,
  fetchStatus,
  parseStateMessage,
  startPairing,
  buildWsUrl,
} from "../lib/server";
import { clearConnection, loadConnection, saveConnection } from "../lib/storage";
import { shouldTrustDiscoveredInstance } from "../lib/trust";

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
  pairingExpiresAt: number | null;
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

    websocket = new WebSocket(buildWsUrl(host), buildWsProtocols(token));

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
  const [{ phase, status, host, error, lastUpdatedAt, pairingExpiresAt }, setState] =
    useState<HookState>({
    phase: "booting",
    status: EMPTY_STATUS,
    host: null,
    error: null,
    lastUpdatedAt: null,
    pairingExpiresAt: null,
  });
  const socketRef = useRef<WebSocketHandle | null>(null);
  const pairingRef = useRef<{
    host: string;
    port: number;
    expiresAt: number;
    instanceId: string;
  } | null>(null);

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
        pairingExpiresAt: null,
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
        pairingExpiresAt: null,
      }));
      pairingRef.current = null;

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
        host: hostToPair,
        error: errorMessage,
      }));

      const pairing = await startPairing(hostToPair, portToPair);
      pairingRef.current = {
        host: hostToPair,
        port: portToPair,
        expiresAt: pairing.expiresAt,
        instanceId,
      };
      setState((current) => ({
        ...current,
        phase: "pairing",
        host: hostToPair,
        error: errorMessage,
        pairingExpiresAt: pairing.expiresAt,
      }));
    },
    []
  );

  const bootstrap = useCallback(async () => {
    closeSocket();
    pairingRef.current = null;

    try {
      const saved = await loadConnection();
      setState((current) => ({
        ...current,
        phase: "discovering",
        error: null,
        pairingExpiresAt: null,
      }));

      let discovered = saved.host ? await fetchDiscovery(saved.host) : null;
      if (!discovered) {
        discovered = await discoverServer(saved.host ?? undefined);
      }
      if (!discovered) {
        setState((current) => ({
          ...current,
          phase: "error",
          error: "Could not discover codex-blocker on this Wi-Fi network.",
          pairingExpiresAt: null,
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
          "Detected a different Codex Blocker server identity. Re-enter pairing code to trust this server."
        );
        return;
      }

      const activeToken = saved.token;
      if (activeToken) {
        const connected = await connectWithToken(discovered.host, activeToken);
        if (connected) {
          await saveConnection(
            discovered.host,
            activeToken,
            discovered.info.instanceId
          );
          return;
        }
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
      }));
    }
  }, [beginPairing, closeSocket, connectWithToken]);

  const submitPairingCode = useCallback(
    async (rawCode: string): Promise<boolean> => {
      const pending = pairingRef.current;
      const code = rawCode.trim();

      if (!pending) {
        setState((current) => ({
          ...current,
          phase: "error",
          error: "No active pairing request. Retry connection first.",
        }));
        return false;
      }

      if (!/^\d{6}$/.test(code)) {
        setState((current) => ({
          ...current,
          phase: "pairing",
          host: pending.host,
          error: "Enter the 6-digit code shown in the server terminal.",
          pairingExpiresAt: pending.expiresAt,
        }));
        return false;
      }

      setState((current) => ({
        ...current,
        phase: "connecting",
        host: pending.host,
        error: null,
      }));

      try {
        const confirmed = await confirmPairing(pending.host, code, pending.port);
        await saveConnection(
          pending.host,
          confirmed.token,
          pending.instanceId
        );
        const connected = await connectWithToken(pending.host, confirmed.token);
        if (!connected) {
          throw new Error("Paired successfully, but failed to read server status.");
        }
        return true;
      } catch (cause) {
        const message =
          cause instanceof Error ? cause.message : "Failed to confirm pairing code.";
        setState((current) => ({
          ...current,
          phase: "pairing",
          host: pending.host,
          error:
            message === "Unable to confirm mobile pairing."
              ? "Invalid or expired code. Start pairing again in the server terminal."
              : message,
          pairingExpiresAt: pending.expiresAt,
        }));
        return false;
      }
    },
    [connectWithToken]
  );

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
    pairingExpiresAt,
    reconnect: bootstrap,
    submitPairingCode,
  };
}
