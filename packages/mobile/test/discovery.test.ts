import { beforeEach, describe, expect, it, vi } from "vitest";

const getIpAddressAsyncMock = vi.hoisted(() => vi.fn<() => Promise<string>>());
const fetchDiscoveryMock = vi.hoisted(
  () =>
    vi.fn<
      (
        host: string,
        port?: number,
        timeoutMs?: number
      ) => Promise<
        | {
            host: string;
            port: number;
            info: {
              name: string;
              instanceId: string;
              port: number;
              pairingRequired: boolean;
              pairingExpiresAt: number | null;
            };
          }
        | null
      >
    >()
);

vi.mock("expo-network", () => ({
  getIpAddressAsync: getIpAddressAsyncMock,
}));

vi.mock("../src/lib/server", () => ({
  fetchDiscovery: fetchDiscoveryMock,
}));

import { discoverServer } from "../src/lib/discovery";

describe("discoverServer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prioritizes preferred host/port and returns quickly when available", async () => {
    getIpAddressAsyncMock.mockResolvedValue("192.168.68.54");
    fetchDiscoveryMock.mockImplementation(async (host, port = 8765) => {
      if (host === "192.168.68.54") {
        return {
          host,
          port,
          info: {
            name: "Codex Blocker",
            instanceId: "instance-a",
            port,
            pairingRequired: true,
            pairingExpiresAt: null,
          },
        };
      }
      return null;
    });

    const result = await discoverServer("192.168.68.54", 9000);
    expect(result?.host).toBe("192.168.68.54");
    expect(result?.port).toBe(9000);
    expect(fetchDiscoveryMock).toHaveBeenCalledWith("192.168.68.54", 9000);
    expect(
      fetchDiscoveryMock.mock.calls.some(([host]) => String(host).startsWith("192.168.68.1"))
    ).toBe(false);
  });

  it("falls back to subnet batches when quick candidates are unavailable", async () => {
    getIpAddressAsyncMock.mockResolvedValue("192.168.68.54");
    fetchDiscoveryMock.mockImplementation(async (host) => {
      if (host === "192.168.68.10") {
        return {
          host,
          port: 8765,
          info: {
            name: "Codex Blocker",
            instanceId: "instance-b",
            port: 8765,
            pairingRequired: true,
            pairingExpiresAt: null,
          },
        };
      }
      return null;
    });

    const result = await discoverServer();
    expect(result?.host).toBe("192.168.68.10");
    expect(
      fetchDiscoveryMock.mock.calls.some(([host]) => host === "codex-blocker.local")
    ).toBe(true);
  });
});
