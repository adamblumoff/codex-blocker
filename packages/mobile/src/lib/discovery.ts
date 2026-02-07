import * as Network from "expo-network";
import { fetchDiscovery, type DiscoveredServer } from "./server";

const DEFAULT_PORT = 8765;
const SCAN_CONCURRENCY = 8;
const SUBNET_BATCH_SIZE = 28;
const SUBNET_BATCH_PAUSE_MS = 16;

function uniqueHosts(candidates: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const host of candidates) {
    const normalized = host.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function getSubnetHostsFromIp(ipAddress: string): string[] {
  const ipv4 = ipAddress.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!ipv4) return [];

  const prefix = `${ipv4[1]}.${ipv4[2]}.${ipv4[3]}`;
  const current = Number(ipv4[4]);

  const prioritized: number[] = [1, 2, 10, 50, 100, 150, 200, 254, current];
  for (let octet = 1; octet <= 254; octet += 1) {
    prioritized.push(octet);
  }

  return uniqueHosts(prioritized.map((octet) => `${prefix}.${octet}`));
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findFirstAvailable(
  hosts: string[],
  port: number,
  concurrency: number
): Promise<DiscoveredServer | null> {
  let nextIndex = 0;
  let winner: DiscoveredServer | null = null;

  const worker = async () => {
    while (winner === null) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= hosts.length) {
        return;
      }

      const host = hosts[current];
      const found = await fetchDiscovery(host, port);
      if (found) {
        winner = found;
        return;
      }
    }
  };

  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(hosts.length, 1)) },
    () => worker()
  );
  await Promise.all(workers);
  return winner;
}

async function scanSubnetInBatches(hosts: string[], port: number): Promise<DiscoveredServer | null> {
  for (let index = 0; index < hosts.length; index += SUBNET_BATCH_SIZE) {
    const batch = hosts.slice(index, index + SUBNET_BATCH_SIZE);
    const found = await findFirstAvailable(batch, port, SCAN_CONCURRENCY);
    if (found) {
      return found;
    }
    if (index + SUBNET_BATCH_SIZE < hosts.length) {
      await pause(SUBNET_BATCH_PAUSE_MS);
    }
  }
  return null;
}

export async function discoverServer(preferredHost?: string): Promise<DiscoveredServer | null> {
  const localIp = await Network.getIpAddressAsync().catch(() => "");
  const quickCandidates = uniqueHosts([preferredHost ?? "", "codex-blocker.local"]);

  if (quickCandidates.length > 0) {
    const quickHit = await findFirstAvailable(quickCandidates, DEFAULT_PORT, 2);
    if (quickHit) {
      return quickHit;
    }
  }

  const subnetCandidates = uniqueHosts(
    getSubnetHostsFromIp(localIp).filter((host) => !quickCandidates.includes(host))
  );

  if (subnetCandidates.length === 0) {
    return null;
  }

  return scanSubnetInBatches(subnetCandidates, DEFAULT_PORT);
}
