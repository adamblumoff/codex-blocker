#!/usr/bin/env node

import { createInterface } from "readline";
import { startServer } from "./server.js";
import { setupCodex, removeCodexSetup, isCodexAvailable } from "./setup.js";
import { DEFAULT_PORT } from "@claude-blocker/shared";

const args = process.argv.slice(2);

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

Options:
  --setup     Show Codex setup info
  --remove    Remove Codex setup (no-op)
  --port      Server port (default: ${DEFAULT_PORT})
  --help      Show this help message

Examples:
  npx codex-blocker            # Start the server
  npx codex-blocker --port 9000
`);
}

async function main(): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
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
  const portIndex = args.indexOf("--port");
  if (portIndex !== -1 && args[portIndex + 1]) {
    const parsed = parseInt(args[portIndex + 1], 10);
    if (!isNaN(parsed) && parsed > 0 && parsed < 65536) {
      port = parsed;
    } else {
      console.error("Invalid port number");
      process.exit(1);
    }
  }

  if (!isCodexAvailable()) {
    console.log("Codex sessions directory not found yet.");
    const answer = await prompt("Run Codex once to create it, then press enter to continue. ");
    if (answer !== undefined) {
      console.log("");
    }
  }

  startServer(port);
}

main();
