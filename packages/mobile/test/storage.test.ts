import { beforeEach, describe, expect, it, vi } from "vitest";

const { asyncStorageMock, secureStoreMock } = vi.hoisted(() => ({
  asyncStorageMock: {
    getItem: vi.fn<(_: string) => Promise<string | null>>(),
    setItem: vi.fn<(_: string, __: string) => Promise<void>>(),
    removeItem: vi.fn<(_: string) => Promise<void>>(),
  },
  secureStoreMock: {
    getItemAsync: vi.fn<(_: string) => Promise<string | null>>(),
    setItemAsync: vi.fn<(_: string, __: string) => Promise<void>>(),
    deleteItemAsync: vi.fn<(_: string) => Promise<void>>(),
  },
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: asyncStorageMock,
}));

vi.mock("expo-secure-store", () => secureStoreMock);

import {
  clearConnection,
  loadConnection,
  saveConnection,
} from "../src/lib/storage";

describe("mobile connection storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores only host + instance metadata for reconnect discovery", async () => {
    await saveConnection("192.168.68.54", "instance-a", 9000);

    expect(asyncStorageMock.setItem).toHaveBeenCalledWith(
      "codexBlocker.serverHost",
      "192.168.68.54"
    );
    expect(asyncStorageMock.setItem).toHaveBeenCalledWith(
      "codexBlocker.serverPort",
      "9000"
    );
    expect(asyncStorageMock.setItem).toHaveBeenCalledWith(
      "codexBlocker.serverInstanceId",
      "instance-a"
    );
    expect(secureStoreMock.setItemAsync).not.toHaveBeenCalled();
  });

  it("loads host + instance and forces fresh token pairing on app cold start", async () => {
    asyncStorageMock.getItem.mockImplementation(async (key) => {
      if (key === "codexBlocker.serverHost") return "192.168.68.54";
      if (key === "codexBlocker.serverPort") return "9000";
      if (key === "codexBlocker.serverInstanceId") return "instance-a";
      return null;
    });
    secureStoreMock.getItemAsync.mockResolvedValue("legacy-token");

    const loaded = await loadConnection();
    expect(loaded).toEqual({
      host: "192.168.68.54",
      port: 9000,
      token: null,
      instanceId: "instance-a",
    });

    expect(secureStoreMock.deleteItemAsync).toHaveBeenCalledWith(
      "codexBlocker.serverToken"
    );
  });

  it("clears host metadata and any legacy token storage", async () => {
    await clearConnection();

    expect(asyncStorageMock.removeItem).toHaveBeenCalledWith("codexBlocker.serverHost");
    expect(asyncStorageMock.removeItem).toHaveBeenCalledWith("codexBlocker.serverPort");
    expect(asyncStorageMock.removeItem).toHaveBeenCalledWith(
      "codexBlocker.serverInstanceId"
    );
    expect(secureStoreMock.deleteItemAsync).toHaveBeenCalledWith(
      "codexBlocker.serverToken"
    );
  });
});
