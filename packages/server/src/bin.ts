#!/usr/bin/env node

import { createRequire } from "module";
import { createInterface } from "readline";
import { startServer } from "./server.js";
import { setupCodex, removeCodexSetup, isCodexAvailable } from "./setup.js";
import { DEFAULT_PORT } from "./types.js";
import {
  runMobileDoctor,
  runMobileFix,
  runMobileRemove,
} from "./mobile-network.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version?: string };

const args = process.argv.slice(2);

function isWindowsOrWslRuntime(): boolean {
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
  npx codex-blocker mobile:doctor [options]
  npx codex-blocker mobile:fix [options]
  npx codex-blocker mobile:remove [options]

Options:
  --setup           Show Codex setup info
  --remove          Remove Codex setup (no-op)
  --port            Server port (default: ${DEFAULT_PORT})
  --bind            Server bind host
  --extension-only  Disable mobile LAN discovery and pairing endpoints
  --mobile-name     Mobile discovery name
  --allow-public    Allow Public-profile firewall access for mobile:fix
  --version         Show version
  --help            Show this help message

Examples:
  npx codex-blocker            # Start the server
  npx codex-blocker --port 9000
  npx codex-blocker --extension-only
  npx codex-blocker mobile:doctor
`);
}

function readOption(name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function readPort(): number {
  const rawPort = readOption("--port");
  if (!rawPort) return DEFAULT_PORT;

  const parsed = parseInt(rawPort, 10);
  if (!isNaN(parsed) && parsed > 0 && parsed < 65536) {
    return parsed;
  }

  console.error("Invalid port number");
  process.exit(1);
}

async function main(): Promise<void> {
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

  const port = readPort();
  const command = args[0];
  if (command === "mobile:doctor") {
    process.exit((await runMobileDoctor(port, {
      allowPublicFirewallRule: args.includes("--allow-public"),
    })) ? 0 : 1);
  }
  if (command === "mobile:fix") {
    process.exit((await runMobileFix(port, {
      allowPublicFirewallRule: args.includes("--allow-public"),
    })) ? 0 : 1);
  }
  if (command === "mobile:remove") {
    process.exit((await runMobileRemove(port)) ? 0 : 1);
  }

  if (!isCodexAvailable()) {
    console.log("Codex sessions directory not found yet.");
    const answer = await prompt("Run Codex once to create it, then press enter to continue. ");
    if (answer !== undefined) {
      console.log("");
    }
  }

  const extensionOnly = args.includes("--extension-only");
  const bindHost =
    readOption("--bind") ??
    (extensionOnly
      ? "127.0.0.1"
      : isWindowsOrWslRuntime()
        ? "0.0.0.0"
        : "127.0.0.1");

  startServer(port, {
    mobile: !extensionOnly,
    bindHost,
    mobileServiceName: readOption("--mobile-name"),
    mobileQrOutput: !extensionOnly,
  });
}

main();
