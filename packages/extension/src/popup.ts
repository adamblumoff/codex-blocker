export {};

interface PopupState {
  blocked: boolean;
  serverConnected: boolean;
  transportConnected?: boolean;
  sessions: number;
  working: number;
  bypassActive: boolean;
  forceBlock: boolean;
  forceOpen: boolean;
  pairingRequired?: boolean;
  pairingExpiresAt?: number | null;
  connectionPhase?: "pairing" | "connecting" | "connected" | "reconnecting" | "offline";
  connectionMessage?: string;
}

type PairingResponse =
  | { success: true; expiresAt?: number }
  | { success: false; error?: string };

const statusDot = document.getElementById("status-dot") as HTMLElement;
const statusText = document.getElementById("status-text") as HTMLElement;
const sessionsEl = document.getElementById("sessions") as HTMLElement;
const workingEl = document.getElementById("working") as HTMLElement;
const blockBadge = document.getElementById("block-badge") as HTMLElement;
const blockStatus = document.getElementById("block-status") as HTMLElement;
const connectionNote = document.getElementById("connection-note") as HTMLElement;
const settingsBtn = document.getElementById("settings-btn") as HTMLButtonElement;
const roastToggle = document.getElementById("roast-toggle") as HTMLInputElement;
const pairingPanel = document.getElementById("pairing-panel") as HTMLElement;
const pairingCodeInput = document.getElementById("pairing-code") as HTMLInputElement;
const pairingSubmitButton = document.getElementById("pairing-submit") as HTMLButtonElement;
const pairingRefreshButton = document.getElementById("pairing-refresh") as HTMLButtonElement;
const pairingMessage = document.getElementById("pairing-message") as HTMLElement;

function formatPairingExpiry(value: number | null | undefined): string {
  if (!value) return "";
  return new Date(value).toLocaleTimeString();
}

function setPairingMessage(message: string): void {
  pairingMessage.textContent = message;
}

function updatePairingUI(state: PopupState): void {
  const pairingRequired = Boolean(state.pairingRequired);
  pairingPanel.hidden = !pairingRequired;
  if (!pairingRequired) {
    pairingCodeInput.value = "";
    return;
  }

  const expiry = formatPairingExpiry(state.pairingExpiresAt ?? null);
  if (expiry) {
    setPairingMessage(`Enter the 6-digit terminal code (expires ${expiry}).`);
  } else {
    setPairingMessage("Enter the 6-digit code from the codex-blocker terminal.");
  }
}

function updateUI(state: PopupState): void {
  const phase = state.connectionPhase;

  if (phase === "pairing" || state.pairingRequired) {
    statusDot.className = "status-dot disconnected";
    statusText.textContent = "Pairing required";
  } else if (phase === "connecting") {
    statusDot.className = "status-dot working";
    statusText.textContent = "Connecting";
  } else if (phase === "reconnecting") {
    statusDot.className = "status-dot working";
    statusText.textContent = "Reconnecting";
  } else if (!state.serverConnected || phase === "offline") {
    statusDot.className = "status-dot disconnected";
    statusText.textContent = "Offline";
  } else if (state.working > 0) {
    statusDot.className = "status-dot working";
    statusText.textContent = "Working";
  } else {
    statusDot.className = "status-dot connected";
    statusText.textContent = "Connected";
  }

  sessionsEl.textContent = String(state.sessions);
  workingEl.textContent = String(state.working);
  connectionNote.textContent =
    state.connectionMessage ??
    (state.serverConnected ? "Connected to codex-blocker server." : "Not connected to server.");

  if (state.forceBlock && !state.forceOpen) {
    blockBadge.className = "block-badge blocked";
    blockStatus.textContent = "Always";
  } else if (state.bypassActive) {
    blockBadge.className = "block-badge bypass";
    blockStatus.textContent = "Bypass";
  } else if (state.blocked) {
    blockBadge.className = "block-badge blocked";
    blockStatus.textContent = "Blocked";
  } else {
    blockBadge.className = "block-badge open";
    blockStatus.textContent = "Open";
  }

  updatePairingUI(state);
}

function refreshState(): void {
  chrome.runtime.sendMessage({ type: "GET_STATE" }, (state: PopupState) => {
    if (state) {
      updateUI(state);
    }
  });
}

function refreshRoastMode(): void {
  chrome.storage.sync.get(["roastMode"], (result) => {
    roastToggle.checked = Boolean(result.roastMode);
  });
}

function submitPairingCode(): void {
  const code = pairingCodeInput.value.trim();
  if (!/^\d{6}$/.test(code)) {
    setPairingMessage("Enter a 6-digit code.");
    return;
  }

  pairingSubmitButton.disabled = true;
  chrome.runtime.sendMessage(
    { type: "CONFIRM_PAIRING", code },
    (response?: PairingResponse) => {
      pairingSubmitButton.disabled = false;
      if (response?.success) {
        pairingCodeInput.value = "";
        setPairingMessage("Paired. Connecting...");
        refreshState();
        return;
      }
      setPairingMessage(response?.error ?? "Could not confirm code.");
    }
  );
}

function refreshPairingCode(): void {
  chrome.runtime.sendMessage(
    { type: "START_PAIRING" },
    (response?: PairingResponse) => {
      if (response?.success) {
        const expiry = formatPairingExpiry(response.expiresAt ?? null);
        setPairingMessage(
          expiry
            ? `Use the latest terminal code (expires ${expiry}).`
            : "Use the latest terminal code."
        );
        refreshState();
        return;
      }
      setPairingMessage(response?.error ?? "Could not start pairing.");
    }
  );
}

settingsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

roastToggle.addEventListener("change", () => {
  const roastMode = roastToggle.checked;
  roastToggle.disabled = true;
  chrome.storage.sync.set({ roastMode }, () => {
    if (chrome.runtime.lastError) {
      roastToggle.checked = !roastMode;
    }
    roastToggle.disabled = false;
  });
});

pairingSubmitButton.addEventListener("click", submitPairingCode);
pairingRefreshButton.addEventListener("click", refreshPairingCode);
pairingCodeInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    submitPairingCode();
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "STATE") {
    updateUI(message);
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.roastMode) {
    roastToggle.checked = Boolean(changes.roastMode.newValue);
  }
});

refreshState();
refreshRoastMode();
setInterval(refreshState, 5000);
