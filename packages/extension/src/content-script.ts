export {};

const MODAL_ID = "codex-blocker-modal";
const TOAST_ID = "codex-blocker-toast";
const DEFAULT_DOMAINS = ["x.com", "youtube.com"];
const iconUrl = chrome.runtime.getURL("icon-mark.svg");

// State shape from service worker
interface PublicState {
  enabled: boolean;
  pauseMedia: boolean;
  forceBlock: boolean;
  serverConnected: boolean;
  sessions: number;
  working: number;
  waitingForInput: number;
  blocked: boolean;
  bypassActive: boolean;
}

// Track current state so we can re-render if modal gets removed
let lastKnownState: PublicState | null = null;
let shouldBeBlocked = false;
let blockedDomains: string[] = [];
let toastDismissed = false;
let observerActive = false;
let statePort: chrome.runtime.Port | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let lastBlocked = false;
let lastPauseMediaActive = true;
const pausedMedia = new Set<HTMLMediaElement>();
const pendingResume = new Set<HTMLMediaElement>();
let resumeListenerAttached = false;

// Load domains from storage
function loadDomains(): Promise<string[]> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["blockedDomains"], (result) => {
      if (result.blockedDomains && Array.isArray(result.blockedDomains)) {
        resolve(result.blockedDomains);
      } else {
        resolve(DEFAULT_DOMAINS);
      }
    });
  });
}

function isBlockedDomain(): boolean {
  const hostname = window.location.hostname.replace(/^www\./, "");
  return blockedDomains.some((d) => hostname === d || hostname.endsWith(`.${d}`));
}

function getModal(): HTMLElement | null {
  return document.getElementById(MODAL_ID);
}

function getShadow(): ShadowRoot | null {
  return getModal()?.shadowRoot ?? null;
}

function createModal(): void {
  if (getModal()) return;

  const container = document.createElement("div");
  container.id = MODAL_ID;
  const shadow = container.attachShadow({ mode: "open" });

  // Use inline styles with bulletproof Arial font (won't change when page loads custom fonts)
  shadow.innerHTML = `
    <div style="all:initial;position:fixed;top:0;left:0;right:0;bottom:0;width:100vw;height:100vh;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;z-index:2147483647;-webkit-font-smoothing:antialiased;">
      <div style="all:initial;background:#1a1a1a;border:1px solid #333;border-radius:16px;padding:40px;max-width:480px;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;-webkit-font-smoothing:antialiased;">
        <img src="${iconUrl}" alt="" style="width:72px;height:72px;margin-bottom:24px;display:inline-block;filter:drop-shadow(0 4px 12px rgba(255, 215, 0, 0.25));"/>
        <div style="color:#fff;font-size:24px;font-weight:bold;margin:0 0 16px;line-height:1.2;">Time to Work</div>
        <div id="message" style="color:#888;font-size:16px;line-height:1.5;margin:0 0 24px;font-weight:normal;">Loading...</div>
        <div style="display:inline-flex;align-items:center;gap:8px;padding:8px 16px;background:#2a2a2a;border-radius:20px;font-size:14px;color:#666;line-height:1;">
          <span id="dot" style="width:8px;height:8px;border-radius:50%;background:#666;flex-shrink:0;"></span>
          <span id="status" style="color:#666;font-size:14px;font-family:Arial,Helvetica,sans-serif;">...</span>
        </div>
        <div id="hint" style="margin-top:24px;font-size:13px;color:#555;line-height:1.4;font-family:Arial,Helvetica,sans-serif;"></div>
        <button id="bypass-btn" style="all:initial;margin-top:24px;padding:12px 24px;background:#333;border:1px solid #444;border-radius:8px;color:#888;font-family:Arial,Helvetica,sans-serif;font-size:13px;cursor:pointer;transition:all 0.2s;">
          Give me 5 minutes (1x per day)
        </button>
      </div>
    </div>
  `;

  // Wire up bypass button
  const bypassBtn = shadow.getElementById("bypass-btn");
  if (bypassBtn) {
    // Check if already used today
    chrome.runtime.sendMessage({ type: "GET_BYPASS_STATUS" }, (status) => {
      if (status?.usedToday) {
        bypassBtn.textContent = "Bypass already used today";
        (bypassBtn as HTMLButtonElement).disabled = true;
        bypassBtn.style.opacity = "0.5";
        bypassBtn.style.cursor = "not-allowed";
      }
    });

    bypassBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "ACTIVATE_BYPASS" }, (response) => {
        if (response?.success) {
          removeModal();
        } else if (response?.reason) {
          bypassBtn.textContent = response.reason;
          (bypassBtn as HTMLButtonElement).disabled = true;
          bypassBtn.style.opacity = "0.5";
          bypassBtn.style.cursor = "not-allowed";
        }
      });
    });

    // Hover effect
    bypassBtn.addEventListener("mouseenter", () => {
      if (!(bypassBtn as HTMLButtonElement).disabled) {
        bypassBtn.style.background = "#444";
        bypassBtn.style.color = "#aaa";
      }
    });
    bypassBtn.addEventListener("mouseleave", () => {
      bypassBtn.style.background = "#333";
      bypassBtn.style.color = "#888";
    });
  }

  // Mount to documentElement (html) instead of body - more resilient to React hydration
  document.documentElement.appendChild(container);
}

function removeModal(): void {
  getModal()?.remove();
}

function getToast(): HTMLElement | null {
  return document.getElementById(TOAST_ID);
}

function showToast(): void {
  if (getToast() || toastDismissed) return;

  const container = document.createElement("div");
  container.id = TOAST_ID;
  const shadow = container.attachShadow({ mode: "open" });

  shadow.innerHTML = `
    <div style="all:initial;position:fixed;bottom:24px;right:24px;background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:16px 20px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#fff;z-index:2147483647;display:flex;align-items:center;gap:12px;box-shadow:0 4px 12px rgba(0,0,0,0.3);-webkit-font-smoothing:antialiased;">
      <span style="font-size:18px;">💬</span>
      <span>Codex has a question for you!</span>
      <button id="dismiss" style="all:initial;margin-left:8px;padding:4px 8px;background:#333;border:none;border-radius:6px;color:#888;font-family:Arial,Helvetica,sans-serif;font-size:12px;cursor:pointer;">Dismiss</button>
    </div>
  `;

  const dismissBtn = shadow.getElementById("dismiss");
  dismissBtn?.addEventListener("click", () => {
    toastDismissed = true;
    removeToast();
  });

  document.documentElement.appendChild(container);
}

function removeToast(): void {
  getToast()?.remove();
}

function pauseMediaElement(element: HTMLMediaElement): void {
  if (element.paused) return;
  try {
    element.pause();
    pausedMedia.add(element);
  } catch {}
}

function pauseAllMedia(): void {
  const mediaElements = Array.from(document.querySelectorAll("video, audio"));
  for (const element of mediaElements) {
    pauseMediaElement(element);
  }
}

function resumePausedMedia(): void {
  for (const element of pausedMedia) {
    if (!element.isConnected) {
      pausedMedia.delete(element);
      continue;
    }
    try {
      if (element.paused) {
        element.play().catch(() => {
          pendingResume.add(element);
          attachResumeOnUserGesture();
        });
      }
    } catch {}
    pausedMedia.delete(element);
  }
}

function attachResumeOnUserGesture(): void {
  if (resumeListenerAttached) return;
  resumeListenerAttached = true;

  const resume = () => {
    resumeListenerAttached = false;
    window.removeEventListener("click", resume, true);
    window.removeEventListener("keydown", resume, true);
    window.removeEventListener("touchstart", resume, true);

    for (const element of Array.from(pendingResume)) {
      if (!element.isConnected) {
        pendingResume.delete(element);
        continue;
      }
      try {
        if (element.paused) {
          element.play().catch(() => {});
        }
      } catch {}
      pendingResume.delete(element);
    }
  };

  window.addEventListener("click", resume, true);
  window.addEventListener("keydown", resume, true);
  window.addEventListener("touchstart", resume, true);
}

function pauseNewMedia(): void {
  const mediaElements = Array.from(document.querySelectorAll("video, audio"));
  for (const element of mediaElements) {
    if (!pausedMedia.has(element)) {
      pauseMediaElement(element);
    }
  }
}

// Watch for our modal being removed by the page and re-add it
function setupMutationObserver(): void {
  if (observerActive) return;
  observerActive = true;
  const observer = new MutationObserver(() => {
    if (shouldBeBlocked && !getModal()) {
      // Modal was removed but should exist - re-create it
      createModal();
      if (lastKnownState) {
        renderState(lastKnownState);
      }
    }
    if (lastBlocked && lastPauseMediaActive) {
      pauseNewMedia();
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

function setDotColor(dot: HTMLElement, color: "green" | "red" | "gray"): void {
  const colors = {
    green: "background:#22c55e;box-shadow:0 0 8px #22c55e;",
    red: "background:#ef4444;box-shadow:0 0 8px #ef4444;",
    gray: "background:#666;box-shadow:none;",
  };
  dot.style.cssText = `width:8px;height:8px;border-radius:50%;flex-shrink:0;${colors[color]}`;
}

function renderState(state: PublicState): void {
  const shadow = getShadow();
  if (!shadow) return;

  const message = shadow.getElementById("message");
  const dot = shadow.getElementById("dot");
  const status = shadow.getElementById("status");
  const hint = shadow.getElementById("hint");
  if (!message || !dot || !status || !hint) return;

  if (!state.serverConnected) {
    message.textContent = "Server offline. Start the blocker server to continue.";
    setDotColor(dot, "red");
    status.textContent = "Server Offline";
    hint.innerHTML = `Run <span style="background:#2a2a2a;padding:2px 8px;border-radius:4px;font-family:ui-monospace,monospace;font-size:12px;">npx codex-blocker</span> to start`;
  } else if (state.sessions === 0) {
    message.textContent = "No Codex sessions detected.";
    setDotColor(dot, "green");
    status.textContent = "Waiting for Codex";
    hint.textContent = "Open a terminal and start Codex";
  } else {
    message.textContent = "Your job finished!";
    setDotColor(dot, "green");
    status.textContent = `${state.sessions} session${state.sessions > 1 ? "s" : ""} idle`;
    hint.textContent = "Type a prompt in Codex to unblock";
  }
}

function renderError(): void {
  const shadow = getShadow();
  if (!shadow) return;

  const message = shadow.getElementById("message");
  const dot = shadow.getElementById("dot");
  const status = shadow.getElementById("status");
  const hint = shadow.getElementById("hint");
  if (!message || !dot || !status || !hint) return;

  message.textContent = "Cannot connect to extension.";
  setDotColor(dot, "red");
  status.textContent = "Extension Error";
  hint.textContent = "Try reloading the extension";
}

// Handle state updates from service worker
function handleState(state: PublicState): void {
  lastKnownState = state;

  if (!state.enabled) {
    shouldBeBlocked = false;
    removeModal();
    removeToast();
    resumePausedMedia();
    lastBlocked = false;
    lastPauseMediaActive = false;
    return;
  }

  if (!isBlockedDomain()) {
    shouldBeBlocked = false;
    removeModal();
    removeToast();
    resumePausedMedia();
    lastBlocked = false;
    lastPauseMediaActive = false;
    return;
  }

  const pauseMediaActive = state.pauseMedia && state.enabled;
  const isBlocked = state.forceBlock ? true : state.blocked;

  // Show toast notification when Codex has a question (non-blocking)
  if (state.waitingForInput > 0) {
    showToast();
  } else {
    toastDismissed = false; // Reset so next question can show toast
    removeToast();
  }

  // Show blocking modal when truly idle
  if (isBlocked) {
    shouldBeBlocked = true;
    createModal();
    renderState(state);
    if (pauseMediaActive && (!lastBlocked || !lastPauseMediaActive)) {
      pauseAllMedia();
    }
  } else {
    shouldBeBlocked = false;
    removeModal();
    if (pauseMediaActive) {
      resumePausedMedia();
    }
  }

  if (!pauseMediaActive) {
    resumePausedMedia();
  }

  lastBlocked = isBlocked;
  lastPauseMediaActive = pauseMediaActive;
}

function connectStatePort(): void {
  if (statePort) return;
  try {
    const port = chrome.runtime.connect({ name: "state" });
    statePort = port;

    port.onMessage.addListener((message) => {
      if (message.type === "STATE") {
        handleState(message);
      }
    });

    port.onDisconnect.addListener(() => {
      statePort = null;
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      reconnectTimeout = setTimeout(connectStatePort, 500);
    });

    port.postMessage({ type: "GET_STATE" });
  } catch {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
    }
    reconnectTimeout = setTimeout(connectStatePort, 500);
  }
}

// Listen for broadcasts from service worker
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "STATE") {
    handleState(message);
  }
  if (message.type === "DOMAINS_UPDATED") {
    blockedDomains = message.domains;
    // Re-evaluate if we should be blocked
    if (lastKnownState) {
      handleState(lastKnownState);
    }
  }
});

// Initialize
async function init(): Promise<void> {
  blockedDomains = await loadDomains();
  setupMutationObserver();

  if (isBlockedDomain()) {
    createModal();
    renderError();
  }

  connectStatePort();
}

init();
