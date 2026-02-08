#!/usr/bin/env node

import { createRequire } from "module";
import { createInterface } from "readline";
import { startServer } from "./server.js";
import { setupCodex, removeCodexSetup, isCodexAvailable } from "./setup.js";
import { DEFAULT_PORT } from "./types.js";
import { runMobileDoctor, runMobileFix, runMobileRemove } from "./mobile-network.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version?: string };

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const FLAGS_WITH_VALUES = new Set(["--port", "--bind", "--mobile-name"]);

function canAutoConfigureHostNetworking(): boolean {
  if (process.platform === "win32") return true;
  return Boolean(process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP);
}

function prompt(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function printHelp(): void {
  console.log(`
Codex Blocker - Block distracting sites when Codex isn't working

Usage:
  npx codex-blocker [options]
  npx codex-blocker mobile:doctor [--port <port>]
  npx codex-blocker mobile:fix [--port <port>]
  npx codex-blocker mobile:remove [--port <port>]

Options:
  --setup     Show Codex setup info
  --remove    Remove Codex setup (no-op)
  --port      Server port (default: ${DEFAULT_PORT})
  --mobile    Deprecated alias (mobile mode is always enabled)
  --extension-only  Run localhost-only extension mode (disable mobile LAN mDNS + QR output + auto-fix)
  --allow-public  Allow firewall opening on Public profile (higher risk)
  --no-auto-fix  Disable automatic mobile doctor+fix on startup
  --mobile-no-auto-fix  Backward-compatible alias for --no-auto-fix
  --bind      Bind host (default: 0.0.0.0, or 127.0.0.1 with --extension-only)
  --mobile-name  Friendly mobile discovery name
  --version   Show version
  --help      Show this help message

Examples:
  npx codex-blocker            # Start the server
  npx codex-blocker --port 9000
  npx codex-blocker --extension-only
  npx codex-blocker --allow-public
  npx codex-blocker --bind 0.0.0.0
  npx codex-blocker mobile:doctor
  npx codex-blocker mobile:doctor --allow-public
  npx codex-blocker mobile:fix
  npx codex-blocker mobile:fix --allow-public
  npx codex-blocker mobile:remove

SECURITY NOTE:
  IF YOU ENABLE MOBILE NETWORKING, RUN "npx codex-blocker mobile:remove --port ${DEFAULT_PORT}"
  TO REMOVE FIREWALL + PORTPROXY CHANGES WHEN YOU NO LONGER NEED MOBILE ACCESS.
`);
}

function getStringFlag(flag: string): string | null {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) return null;
  return value;
}

function getCommandArg(): string | null {
  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if (current.startsWith("--")) {
      if (FLAGS_WITH_VALUES.has(current)) {
        index += 1;
      }
      continue;
    }
    return current;
  }
  return null;
}

async function main(): Promise<void> {
  const command = getCommandArg();

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  if (args.includes("--version") || args.includes("-v")) {
    console.log(version ?? "unknown");
    process.exit(0);
  }

  if (args.includes("--setup")) {
    setupCodex();
    process.exit(0);
  }

  if (args.includes("--remove")) {
    removeCodexSetup();
    process.exit(0);
  }

  // Parse port
  let port = DEFAULT_PORT;
  const portArg = getStringFlag("--port");
  if (portArg) {
    const parsed = parseInt(portArg, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed < 65536) {
      port = parsed;
    } else {
      console.error("Invalid port number");
      process.exit(1);
    }
  }

  const allowPublicFirewallRule = args.includes("--allow-public");
  const extensionOnly = args.includes("--extension-only");
  const explicitBindHost = getStringFlag("--bind");
  const bindHost = explicitBindHost ?? (extensionOnly ? "127.0.0.1" : "0.0.0.0");
  const mobileServiceName = getStringFlag("--mobile-name") ?? "Codex Blocker";

  if (command === "mobile:doctor") {
    const healthy = await runMobileDoctor(port, { allowPublicFirewallRule });
    process.exit(healthy ? 0 : 1);
  }

  if (command === "mobile:fix") {
    const healthy = await runMobileFix(port, { allowPublicFirewallRule });
    process.exit(healthy ? 0 : 1);
  }

  if (command === "mobile:remove") {
    const removed = await runMobileRemove(port);
    process.exit(removed ? 0 : 1);
  }

  if (!isCodexAvailable()) {
    console.log("Codex sessions directory not found yet.");
    const answer = await prompt("Run Codex once to create it, then press enter to continue. ");
    if (answer !== undefined) {
      console.log("");
    }
  }

  const handle = startServer(port, {
    mobile: true,
    bindHost,
    mobileServiceName,
    publishMdns: !extensionOnly,
    mobileQrOutput: !extensionOnly,
    autoStartMobilePairing: true,
  });

  const autoFixDisabled =
    args.includes("--no-auto-fix") || args.includes("--mobile-no-auto-fix");
  const shouldAutoFix = canAutoConfigureHostNetworking();

  if (extensionOnly) {
    const ignoredFlags: string[] = [];
    if (allowPublicFirewallRule) ignoredFlags.push("--allow-public");
    if (autoFixDisabled) ignoredFlags.push("--no-auto-fix/--mobile-no-auto-fix");
    if (args.includes("--mobile-name")) ignoredFlags.push("--mobile-name");
    if (ignoredFlags.length > 0) {
      console.warn(
        `[Codex Blocker] Extension-only mode ignores ${ignoredFlags.join(", ")}.\n`
      );
    }
    console.log(
      "[Codex Blocker] Extension-only mode active: mobile LAN discovery and auto-fix are disabled."
    );
    if (!explicitBindHost) {
      console.log("[Codex Blocker] Binding to localhost (127.0.0.1). Use --bind to override.\n");
    }
  }

  if (allowPublicFirewallRule && !extensionOnly) {
    console.warn(
      "[Codex Blocker] SECURITY WARNING: --allow-public ENABLES FIREWALL ACCESS ON PUBLIC WI-FI.\n"
    );
  }

  if (!extensionOnly && !autoFixDisabled && shouldAutoFix) {
    void (async () => {
      const activePort = await handle.ready;
      console.log(
        `[Codex Blocker] SECURITY NOTE: RUN \`npx codex-blocker mobile:remove --port ${activePort}\` TO REMOVE FIREWALL + PORTPROXY RULES WHEN MOBILE ACCESS IS NO LONGER NEEDED.\n`
      );
      console.log("\n[Codex Blocker] Running mobile doctor...");
      const healthy = await runMobileDoctor(activePort, { allowPublicFirewallRule });
      if (healthy) {
        console.log("[Codex Blocker] Mobile networking is healthy.\n");
        return;
      }

      console.log("[Codex Blocker] Doctor detected issues. Running mobile fix...\n");
      const fixed = await runMobileFix(activePort, { allowPublicFirewallRule });
      if (!fixed) {
        console.warn(
          "[Codex Blocker] Auto-fix did not fully resolve networking. Run `npx codex-blocker mobile:doctor` for details.\n"
        );
      }
    })();
  } else if (!extensionOnly) {
    void (async () => {
      const activePort = await handle.ready;
      console.log(
        `[Codex Blocker] SECURITY NOTE: RUN \`npx codex-blocker mobile:remove --port ${activePort}\` TO REMOVE FIREWALL + PORTPROXY RULES WHEN MOBILE ACCESS IS NO LONGER NEEDED.\n`
      );
    })();
  }
}

main();
