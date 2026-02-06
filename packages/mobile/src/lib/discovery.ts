import * as Network from "expo-network";
import { fetchDiscovery, type DiscoveredServer } from "./server";

const DEFAULT_PORT = 8765;
const SCAN_CONCURRENCY = 24;

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
  for (let i = 1; i <= 254; i += 1) {
    prioritized.push(i);
  }

  const ordered = uniqueHosts(prioritized.map((octet) => `${prefix}.${octet}`));
  return ordered;
}

async function findFirstAvailable(hosts: string[], port: number): Promise<DiscoveredServer | null> {
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
    { length: Math.min(SCAN_CONCURRENCY, Math.max(hosts.length, 1)) },
    () => worker()
  );

  await Promise.all(workers);
  return winner;
}

export async function discoverServer(preferredHost?: string): Promise<DiscoveredServer | null> {
  const localIp = await Network.getIpAddressAsync().catch(() => "");
  const candidates = uniqueHosts([
    preferredHost ?? "",
    "codex-blocker.local",
    ...getSubnetHostsFromIp(localIp),
  ]);

  if (candidates.length === 0) {
    return null;
  }

  return findFirstAvailable(candidates, DEFAULT_PORT);
}
