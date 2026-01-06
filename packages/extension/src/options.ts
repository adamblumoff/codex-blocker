export {};

const DEFAULT_DOMAINS = ["x.com", "youtube.com"];

interface ExtensionState {
  blocked: boolean;
  serverConnected: boolean;
  sessions: number;
  working: number;
  bypassActive: boolean;
  pauseMedia: boolean;
  forceBlock: boolean;
  forceOpen: boolean;
}

interface BypassStatus {
  usedToday: boolean;
  bypassActive: boolean;
  bypassUntil: number | null;
}

// Elements
const statusIndicator = document.getElementById("status-indicator") as HTMLElement;
const statusText = document.getElementById("status-text") as HTMLElement;
const versionEl = document.getElementById("extension-version") as HTMLElement;
const sessionsEl = document.getElementById("sessions") as HTMLElement;
const workingEl = document.getElementById("working") as HTMLElement;
const blockStatusEl = document.getElementById("block-status") as HTMLElement;
const blockingCard = document.getElementById("blocking-card") as HTMLElement;
const addForm = document.getElementById("add-form") as HTMLFormElement;
const domainInput = document.getElementById("domain-input") as HTMLInputElement;
const domainList = document.getElementById("domain-list") as HTMLUListElement;
const siteCount = document.getElementById("site-count") as HTMLElement;
const bypassBtn = document.getElementById("bypass-btn") as HTMLButtonElement;
const bypassText = document.getElementById("bypass-text") as HTMLElement;
const bypassStatus = document.getElementById("bypass-status") as HTMLElement;
const enabledToggle = document.getElementById("enabled-toggle") as HTMLInputElement;
const pauseMediaToggle = document.getElementById("pause-media-toggle") as HTMLInputElement;
const forceBlockToggle = document.getElementById("force-block-toggle") as HTMLInputElement;

let bypassCountdown: ReturnType<typeof setInterval> | null = null;
let currentDomains: string[] = [];

// Load domains from storage
async function loadDomains(): Promise<string[]> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["blockedDomains"], (result) => {
      if (result.blockedDomains && Array.isArray(result.blockedDomains)) {
        resolve(result.blockedDomains);
      } else {
        chrome.storage.sync.set({ blockedDomains: DEFAULT_DOMAINS });
        resolve(DEFAULT_DOMAINS);
      }
    });
  });
}

// Save domains to storage
async function saveDomains(domains: string[]): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ blockedDomains: domains }, () => {
      chrome.runtime.sendMessage({ type: "DOMAINS_UPDATED", domains }).catch(() => {});
      resolve();
    });
  });
}

// Normalize domain input
function normalizeDomain(input: string): string {
  let domain = input.toLowerCase().trim();
  domain = domain.replace(/^https?:\/\//, "");
  domain = domain.replace(/^www\./, "");
  domain = domain.replace(/\/.*$/, "");
  return domain;
}

// Validate domain format
function isValidDomain(domain: string): boolean {
  const regex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/;
  return regex.test(domain);
}

// Render the domain list
function renderDomains(): void {
  domainList.innerHTML = "";
  siteCount.textContent = String(currentDomains.length);

  if (currentDomains.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    domainList.appendChild(empty);
    return;
  }

  for (const domain of currentDomains) {
    const li = document.createElement("li");
    li.className = "domain-item";

    const nameSpan = document.createElement("span");
    nameSpan.className = "domain-name";
    nameSpan.textContent = domain;

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-btn";
    removeBtn.title = "Remove site";
    removeBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"/>
        <line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    `;
    removeBtn.addEventListener("click", () => removeDomain(domain));

    li.appendChild(nameSpan);
    li.appendChild(removeBtn);
    domainList.appendChild(li);
  }
}

// Add a domain
async function addDomain(raw: string): Promise<void> {
  const domain = normalizeDomain(raw);

  if (!domain) return;

  if (!isValidDomain(domain)) {
    domainInput.classList.add("error");
    setTimeout(() => domainInput.classList.remove("error"), 400);
    return;
  }

  if (currentDomains.includes(domain)) {
    domainInput.value = "";
    return;
  }

  currentDomains.push(domain);
  currentDomains.sort();
  await saveDomains(currentDomains);
  renderDomains();
  domainInput.value = "";
}

// Remove a domain
async function removeDomain(domain: string): Promise<void> {
  currentDomains = currentDomains.filter((d) => d !== domain);
  await saveDomains(currentDomains);
  renderDomains();
}

// Update UI with extension state
function updateUI(state: ExtensionState): void {
  // Status badge
  if (!state.serverConnected) {
    statusIndicator.className = "status-indicator disconnected";
    statusText.textContent = "Offline";
  } else if (state.working > 0) {
    statusIndicator.className = "status-indicator working";
    statusText.textContent = "Codex Working";
  } else {
    statusIndicator.className = "status-indicator connected";
    statusText.textContent = "Connected";
  }

  // Stats
  sessionsEl.textContent = String(state.sessions);
  workingEl.textContent = String(state.working);

  // Block status
  enabledToggle.checked = state.forceOpen;
  enabledToggle.disabled = false;
  pauseMediaToggle.checked = state.pauseMedia;
  pauseMediaToggle.disabled = false;
  forceBlockToggle.checked = state.forceBlock;
  forceBlockToggle.disabled = false;

  if (state.forceOpen && !state.forceBlock) {
    blockStatusEl.textContent = "Always Open";
    blockStatusEl.style.color = "var(--text-muted)";
  } else if (state.forceBlock && !state.forceOpen) {
    blockStatusEl.textContent = "Always";
    blockStatusEl.style.color = "var(--accent-red)";
  } else if (state.bypassActive) {
    blockStatusEl.textContent = "Bypassed";
    blockStatusEl.style.color = "var(--accent-amber)";
  } else if (state.blocked) {
    blockStatusEl.textContent = "Blocking";
    blockStatusEl.style.color = "var(--accent-red)";
  } else {
    blockStatusEl.textContent = "Open";
    blockStatusEl.style.color = "var(--accent-green)";
  }
}

// Update bypass button state
function updateBypassButton(status: BypassStatus): void {
  if (bypassCountdown) {
    clearInterval(bypassCountdown);
    bypassCountdown = null;
  }

  if (status.bypassActive && status.bypassUntil) {
    bypassBtn.disabled = true;
    bypassBtn.classList.add("active");

    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((status.bypassUntil! - Date.now()) / 1000));
      const minutes = Math.floor(remaining / 60);
      const seconds = remaining % 60;
      bypassText.textContent = `Bypass Active · ${minutes}:${seconds.toString().padStart(2, "0")}`;

      if (remaining <= 0) {
        if (bypassCountdown) clearInterval(bypassCountdown);
        refreshState();
      }
    };

    updateCountdown();
    bypassCountdown = setInterval(updateCountdown, 1000);
    bypassStatus.textContent = "Bypass will expire soon";
  } else if (status.usedToday) {
    bypassBtn.disabled = true;
    bypassBtn.classList.remove("active");
    bypassText.textContent = "Bypass Used Today";
    bypassStatus.textContent = "Resets at midnight";
  } else {
    bypassBtn.disabled = false;
    bypassBtn.classList.remove("active");
    bypassText.textContent = "Activate Bypass";
    bypassStatus.textContent = "5 minutes of unblocked access, once per day";
  }
}

// Refresh state from service worker
function refreshState(): void {
  chrome.runtime.sendMessage({ type: "GET_STATE" }, (state: ExtensionState) => {
    if (state) {
      updateUI(state);
    }
  });

  chrome.runtime.sendMessage({ type: "GET_BYPASS_STATUS" }, (status: BypassStatus) => {
    if (status) {
      updateBypassButton(status);
    }
  });
}

// Event listeners
addForm.addEventListener("submit", (e) => {
  e.preventDefault();
  addDomain(domainInput.value);
});

enabledToggle.addEventListener("change", () => {
  const forceOpen = enabledToggle.checked;
  enabledToggle.disabled = true;
  chrome.runtime.sendMessage({ type: "SET_FORCE_OPEN", forceOpen }, (response) => {
    if (chrome.runtime.lastError || !response?.success) {
      enabledToggle.checked = !forceOpen;
    }
    enabledToggle.disabled = false;
  });
});

pauseMediaToggle.addEventListener("change", () => {
  const pauseMedia = pauseMediaToggle.checked;
  pauseMediaToggle.disabled = true;
  chrome.runtime.sendMessage({ type: "SET_PAUSE_MEDIA", pauseMedia }, (response) => {
    if (chrome.runtime.lastError || !response?.success) {
      pauseMediaToggle.checked = !pauseMedia;
    }
    pauseMediaToggle.disabled = false;
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

bypassBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "ACTIVATE_BYPASS" }, (response) => {
    if (response?.success) {
      refreshState();
    } else if (response?.reason) {
      bypassStatus.textContent = response.reason;
    }
  });
});

// Listen for state broadcasts
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "STATE") {
    updateUI(message);
  }
});

// Initialize
async function init(): Promise<void> {
  const manifest = chrome.runtime.getManifest();
  if (versionEl && manifest?.version) {
    versionEl.textContent = `v${manifest.version}`;
  }
  currentDomains = await loadDomains();
  renderDomains();
  refreshState();
}

init();

// Refresh periodically
setInterval(refreshState, 5000);
