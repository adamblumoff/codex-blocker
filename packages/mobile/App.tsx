import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as Notifications from "expo-notifications";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useCodexConnection } from "./src/hooks/useCodexConnection";
import { computeShouldBlock } from "./src/lib/blocking";
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreferences,
} from "./src/lib/storage";
import type { MobilePreferences } from "./src/types";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function formatLastUpdate(value: number | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString();
}

function formatPairingExpiry(value: number | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString();
}

function getConnectionMessage(phase: string, error: string | null): string {
  if (error) return error;
  if (phase === "connected") return "Connected to codex-blocker server.";
  if (phase === "pairing") return "Not connected. Scan the terminal QR code to pair.";
  if (phase === "connecting" || phase === "discovering" || phase === "booting") {
    return "Connecting to codex-blocker server...";
  }
  return "Not connected to codex-blocker server.";
}

export default function App() {
  const {
    phase,
    status,
    host,
    error,
    lastUpdatedAt,
    pairingExpiresAt,
    qrExpiresAt,
    pairingNotice,
    reconnect,
    refreshPairing,
    submitPairingQrPayload,
  } = useCodexConnection();
  const [preferences, setPreferences] = useState<MobilePreferences>(DEFAULT_PREFERENCES);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerBusy, setScannerBusy] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const previousBlockedRef = useRef<boolean | null>(null);
  const scannerInFlightRef = useRef(false);
  const scannerBusyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void loadPreferences().then(setPreferences);
  }, []);

  useEffect(() => {
    if (phase !== "pairing") {
      setScannerOpen(false);
      setScannerBusy(false);
      scannerInFlightRef.current = false;
      if (scannerBusyTimeoutRef.current) {
        clearTimeout(scannerBusyTimeoutRef.current);
        scannerBusyTimeoutRef.current = null;
      }
    }
  }, [phase]);

  useEffect(() => {
    return () => {
      if (scannerBusyTimeoutRef.current) {
        clearTimeout(scannerBusyTimeoutRef.current);
      }
    };
  }, []);

  const openScanner = useCallback(async () => {
    if (cameraPermission?.granted) {
      setScannerOpen(true);
      return;
    }
    const requested = await requestCameraPermission();
    if (requested.granted) {
      setScannerOpen(true);
    }
  }, [cameraPermission?.granted, requestCameraPermission]);

  const onBarcodeScanned = useCallback(
    (event: { data: string }) => {
      // Camera scanners can emit duplicate reads before React state updates apply.
      if (!scannerOpen || scannerInFlightRef.current) return;
      scannerInFlightRef.current = true;
      setScannerBusy(true);
      void submitPairingQrPayload(event.data)
        .then((success) => {
          if (success) {
            setScannerOpen(false);
          }
        })
        .finally(() => {
          if (scannerBusyTimeoutRef.current) {
            clearTimeout(scannerBusyTimeoutRef.current);
          }
          scannerBusyTimeoutRef.current = setTimeout(() => {
            scannerInFlightRef.current = false;
            setScannerBusy(false);
            scannerBusyTimeoutRef.current = null;
          }, 650);
        });
    },
    [scannerOpen, submitPairingQrPayload]
  );

  const updatePreferences = useCallback(async (next: MobilePreferences) => {
    setPreferences(next);
    await savePreferences(next);
  }, []);

  const onNotificationsToggle = useCallback(
    async (enabled: boolean) => {
      if (enabled) {
        const existing = await Notifications.getPermissionsAsync();
        if (existing.status !== "granted") {
          const requested = await Notifications.requestPermissionsAsync();
          if (requested.status !== "granted") {
            return;
          }
        }
      }

      await updatePreferences({
        ...preferences,
        notificationsEnabled: enabled,
      });
    },
    [preferences, updatePreferences]
  );

  const onBlockingToggle = useCallback(
    async (enabled: boolean) => {
      await updatePreferences({
        ...preferences,
        blockingEnabled: enabled,
      });
    },
    [preferences, updatePreferences]
  );

  useEffect(() => {
    if (!preferences.notificationsEnabled) {
      previousBlockedRef.current = status.blocked;
      return;
    }

    const previous = previousBlockedRef.current;
    previousBlockedRef.current = status.blocked;

    if (previous === null || previous === status.blocked) {
      return;
    }

    const content = status.blocked
      ? {
          title: "Codex finished",
          body: "Codex is idle or waiting for input.",
        }
      : {
          title: "Codex resumed",
          body: "Codex is working again.",
        };

    void Notifications.scheduleNotificationAsync({
      content,
      trigger: null,
    });
  }, [preferences.notificationsEnabled, status.blocked]);

  const shouldBlock = useMemo(
    () =>
      computeShouldBlock({
        serverConnected: phase === "connected",
        sessions: status.sessions,
        working: status.working,
        waitingForInput: status.waitingForInput,
      }),
    [phase, status.sessions, status.working, status.waitingForInput]
  );

  const connectionColor =
    phase === "connected" ? "#1f7a4d" : phase === "error" ? "#a23636" : "#8b6e26";
  const connectionMessage = getConnectionMessage(phase, error);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.headerCard}>
          <Text style={styles.title}>Codex Blocker Mobile</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: connectionColor }]} />
            <Text style={styles.statusText}>{phase}</Text>
          </View>
          <View
            style={[
              styles.connectionBanner,
              phase === "connected"
                ? styles.connectionBannerConnected
                : phase === "error"
                  ? styles.connectionBannerError
                  : styles.connectionBannerPending,
            ]}
          >
            <Text style={styles.connectionBannerText}>{connectionMessage}</Text>
          </View>
          <Text style={styles.hostText}>{host ? `Server: ${host}` : "Server: searching"}</Text>
          <Text style={styles.hostText}>Last update: {formatLastUpdate(lastUpdatedAt)}</Text>
          {phase === "booting" || phase === "discovering" || phase === "connecting" ? (
            <View style={styles.discoveryRow}>
              <ActivityIndicator size="small" color="#8b6e26" />
              <Text style={styles.discoveryText}>Connecting over local Wi-Fi...</Text>
            </View>
          ) : null}
          {phase === "pairing" ? (
            <View style={styles.discoveryRow}>
              <Text style={styles.discoveryText}>
                Scan the latest QR code shown in your Codex Blocker terminal.
              </Text>
            </View>
          ) : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <TouchableOpacity style={styles.retryButton} onPress={() => void reconnect()}>
            <Text style={styles.retryLabel}>Retry Connection</Text>
          </TouchableOpacity>
        </View>

        {phase === "pairing" ? (
          <View style={styles.pairingCard}>
            <Text style={styles.sectionTitle}>Pair This Phone</Text>
            <Text style={styles.pairingSubtitle}>
              QR expires at {formatPairingExpiry(qrExpiresAt)}. If it times out, tap Refresh QR to
              print a new one in your terminal.
            </Text>
            {pairingNotice ? (
              <View style={styles.pairingNotice}>
                <Text style={styles.pairingNoticeText}>{pairingNotice}</Text>
              </View>
            ) : null}
            {!cameraPermission?.granted ? (
              <Text style={styles.pairingSubtitle}>
                Camera permission is required to scan QR pairing codes.
              </Text>
            ) : null}
            {scannerOpen ? (
              <View style={styles.scannerWrap}>
                <CameraView
                  style={styles.scannerCamera}
                  onBarcodeScanned={onBarcodeScanned}
                  barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                />
                <View style={styles.scannerControls}>
                  <TouchableOpacity
                    style={styles.secondaryPairButton}
                    onPress={() => setScannerOpen(false)}
                  >
                    <Text style={styles.secondaryPairButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.secondaryPairButton}
                    onPress={() => void refreshPairing()}
                  >
                    <Text style={styles.secondaryPairButtonText}>Refresh QR</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.scannerControls}>
                <TouchableOpacity
                  style={styles.pairButton}
                  onPress={() => void openScanner()}
                  disabled={scannerBusy}
                >
                  <Text style={styles.retryLabel}>Scan QR</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.secondaryPairButton}
                  onPress={() => void refreshPairing()}
                >
                  <Text style={styles.secondaryPairButtonText}>Refresh QR</Text>
                </TouchableOpacity>
              </View>
            )}
            <Text style={styles.pairingMeta}>
              Pairing session expires at {formatPairingExpiry(pairingExpiresAt)}.
            </Text>
          </View>
        ) : null}

        <View style={styles.metricsCard}>
          <Text style={styles.sectionTitle}>Server State</Text>
          <View style={styles.metricGrid}>
            <View style={styles.metricTile}>
              <Text style={styles.metricLabel}>Sessions</Text>
              <Text style={styles.metricValue}>{status.sessions}</Text>
            </View>
            <View style={styles.metricTile}>
              <Text style={styles.metricLabel}>Working</Text>
              <Text style={styles.metricValue}>{status.working}</Text>
            </View>
            <View style={styles.metricTile}>
              <Text style={styles.metricLabel}>Waiting</Text>
              <Text style={styles.metricValue}>{status.waitingForInput}</Text>
            </View>
            <View style={styles.metricTile}>
              <Text style={styles.metricLabel}>Block State</Text>
              <Text style={styles.metricValue}>{shouldBlock ? "Blocked" : "Open"}</Text>
            </View>
          </View>
        </View>

        <View style={styles.togglesCard}>
          <Text style={styles.sectionTitle}>Modes</Text>
          <View style={styles.toggleRow}>
            <View>
              <Text style={styles.toggleTitle}>Notify when finished</Text>
              <Text style={styles.toggleSubtitle}>
                Sends a local notification when Codex goes idle/waiting.
              </Text>
            </View>
            <Switch value={preferences.notificationsEnabled} onValueChange={onNotificationsToggle} />
          </View>

          <View style={styles.toggleRow}>
            <View style={styles.toggleTextWrap}>
              <Text style={styles.toggleTitle}>Block selected apps</Text>
              <Text style={styles.toggleSubtitle}>
                Screen Time shielding will be enabled in an iOS dev build (not available in Expo Go).
              </Text>
            </View>
            <Switch value={preferences.blockingEnabled} onValueChange={onBlockingToggle} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f2efe7",
  },
  container: {
    padding: 16,
    gap: 14,
  },
  headerCard: {
    backgroundColor: "#fffaf2",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e0d5c2",
    gap: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1d2433",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusText: {
    fontSize: 14,
    textTransform: "capitalize",
    color: "#1d2433",
    fontWeight: "600",
  },
  hostText: {
    fontSize: 13,
    color: "#4d5566",
  },
  connectionBanner: {
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
  },
  connectionBannerConnected: {
    backgroundColor: "#edf8f1",
    borderColor: "#bee2cb",
  },
  connectionBannerPending: {
    backgroundColor: "#fff7e8",
    borderColor: "#e9d3a4",
  },
  connectionBannerError: {
    backgroundColor: "#fdeeee",
    borderColor: "#e8c2c2",
  },
  connectionBannerText: {
    fontSize: 12,
    color: "#2c3548",
  },
  discoveryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  discoveryText: {
    fontSize: 13,
    color: "#7e6e46",
  },
  errorText: {
    color: "#a23636",
    fontSize: 13,
  },
  retryButton: {
    marginTop: 8,
    backgroundColor: "#1f7a4d",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  retryLabel: {
    color: "#fff",
    fontWeight: "600",
  },
  metricsCard: {
    backgroundColor: "#f8f4eb",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#d8cdb9",
    gap: 12,
  },
  pairingCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#dfd7c9",
    gap: 10,
  },
  pairingSubtitle: {
    fontSize: 12,
    color: "#546075",
  },
  pairingNotice: {
    backgroundColor: "#fff5d8",
    borderColor: "#e9cf86",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  pairingNoticeText: {
    fontSize: 12,
    color: "#6d5618",
    fontWeight: "600",
  },
  pairButton: {
    backgroundColor: "#1f7a4d",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    minWidth: 120,
  },
  secondaryPairButton: {
    borderWidth: 1,
    borderColor: "#b7a688",
    backgroundColor: "#fffaf2",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    minWidth: 120,
  },
  secondaryPairButtonText: {
    color: "#3b3f49",
    fontWeight: "600",
  },
  scannerWrap: {
    gap: 10,
  },
  scannerCamera: {
    height: 260,
    borderRadius: 12,
    overflow: "hidden",
  },
  scannerControls: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  pairingMeta: {
    fontSize: 11,
    color: "#6b7384",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1d2433",
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metricTile: {
    width: "47%",
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#ece2cf",
    gap: 4,
  },
  metricLabel: {
    fontSize: 12,
    color: "#546075",
  },
  metricValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#131923",
  },
  togglesCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#dfd7c9",
    gap: 14,
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  toggleTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1d2433",
  },
  toggleSubtitle: {
    fontSize: 12,
    color: "#546075",
    marginTop: 4,
    maxWidth: 240,
  },
  toggleTextWrap: {
    flex: 1,
  },
});
