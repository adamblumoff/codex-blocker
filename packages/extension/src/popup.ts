export {};

interface PopupState {
  blocked: boolean;
  serverConnected: boolean;
  sessions: number;
  working: number;
  bypassActive: boolean;
  forceBlock: boolean;
  forceOpen: boolean;
}

const statusDot = document.getElementById("status-dot") as HTMLElement;
const statusText = document.getElementById("status-text") as HTMLElement;
const sessionsEl = document.getElementById("sessions") as HTMLElement;
const workingEl = document.getElementById("working") as HTMLElement;
const blockBadge = document.getElementById("block-badge") as HTMLElement;
const blockStatus = document.getElementById("block-status") as HTMLElement;
const settingsBtn = document.getElementById("settings-btn") as HTMLButtonElement;
const extensionToggle = document.getElementById("extension-enabled") as HTMLInputElement;
const forceBlockToggle = document.getElementById("force-block-toggle") as HTMLInputElement;

function updateUI(state: PopupState): void {
  // Status indicator
  if (!state.serverConnected) {
    statusDot.className = "status-dot disconnected";
    statusText.textContent = "Offline";
  } else if (state.working > 0) {
    statusDot.className = "status-dot working";
    statusText.textContent = "Working";
  } else {
    statusDot.className = "status-dot connected";
    statusText.textContent = "Connected";
  }

  // Stats
  sessionsEl.textContent = String(state.sessions);
  workingEl.textContent = String(state.working);

  extensionToggle.checked = state.forceOpen;
  extensionToggle.disabled = false;
  forceBlockToggle.checked = state.forceBlock;
  forceBlockToggle.disabled = false;

  // Block badge
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
}

function refreshState(): void {
  chrome.runtime.sendMessage({ type: "GET_STATE" }, (state: PopupState) => {
    if (state) {
      updateUI(state);
    }
  });
}

settingsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

extensionToggle.addEventListener("change", () => {
  const forceOpen = extensionToggle.checked;
  extensionToggle.disabled = true;
  chrome.runtime.sendMessage({ type: "SET_FORCE_OPEN", forceOpen }, (response) => {
    if (chrome.runtime.lastError || !response?.success) {
      extensionToggle.checked = !forceOpen;
    }
    extensionToggle.disabled = false;
  });
});

forceBlockToggle.addEventListener("change", () => {
  const forceBlock = forceBlockToggle.checked;
  forceBlockToggle.disabled = true;
  chrome.runtime.sendMessage({ type: "SET_FORCE_BLOCK", forceBlock }, (response) => {
    if (chrome.runtime.lastError || !response?.success) {
      forceBlockToggle.checked = !forceBlock;
    }
    forceBlockToggle.disabled = false;
  });
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "STATE") {
    updateUI(message);
  }
});

refreshState();
setInterval(refreshState, 5000);
