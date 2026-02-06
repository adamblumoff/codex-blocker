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
  --mobile    Enable mobile/LAN mode (binds to 0.0.0.0 by default)
  --mobile-no-auto-fix  Disable automatic mobile doctor+fix on startup
  --bind      Bind host (default: 127.0.0.1 or 0.0.0.0 with --mobile)
  --mobile-name  Friendly mobile discovery name
  --version   Show version
  --help      Show this help message

Examples:
  npx codex-blocker            # Start the server
  npx codex-blocker --port 9000
  npx codex-blocker --mobile
  npx codex-blocker --mobile --bind 0.0.0.0
  npx codex-blocker mobile:doctor
  npx codex-blocker mobile:fix
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

  const mobile = args.includes("--mobile");
  const bindHost = getStringFlag("--bind") ?? (mobile ? "0.0.0.0" : "127.0.0.1");
  const mobileServiceName = getStringFlag("--mobile-name") ?? "Codex Blocker";

  if (command === "mobile:doctor") {
    const healthy = await runMobileDoctor(port);
    process.exit(healthy ? 0 : 1);
  }

  if (command === "mobile:fix") {
    const healthy = await runMobileFix(port);
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
    mobile,
    bindHost,
    mobileServiceName,
  });

  const autoFixDisabled = args.includes("--mobile-no-auto-fix");
  if (mobile && !autoFixDisabled) {
    void (async () => {
      const activePort = await handle.ready;
      console.log(
        `[Codex Blocker] SECURITY NOTE: RUN \`npx codex-blocker mobile:remove --port ${activePort}\` TO REMOVE FIREWALL + PORTPROXY RULES WHEN MOBILE ACCESS IS NO LONGER NEEDED.\n`
      );
      console.log("\n[Codex Blocker] Running mobile doctor...");
      const healthy = await runMobileDoctor(activePort);
      if (healthy) {
        console.log("[Codex Blocker] Mobile networking is healthy.\n");
        return;
      }

      console.log("[Codex Blocker] Doctor detected issues. Running mobile fix...\n");
      const fixed = await runMobileFix(activePort);
      if (!fixed) {
        console.warn(
          "[Codex Blocker] Auto-fix did not fully resolve networking. Run `npx codex-blocker mobile:doctor` for details.\n"
        );
      }
    })();
  } else if (mobile) {
    void (async () => {
      const activePort = await handle.ready;
      console.log(
        `[Codex Blocker] SECURITY NOTE: RUN \`npx codex-blocker mobile:remove --port ${activePort}\` TO REMOVE FIREWALL + PORTPROXY RULES WHEN MOBILE ACCESS IS NO LONGER NEEDED.\n`
      );
    })();
  }
}

main();
