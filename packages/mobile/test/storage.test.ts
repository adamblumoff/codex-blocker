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

  it("stores auth token in secure storage and host/instance in async storage", async () => {
    await saveConnection("192.168.68.54", "token-123", "instance-a");

    expect(secureStoreMock.setItemAsync).toHaveBeenCalledWith(
      "codexBlocker.serverToken",
      "token-123"
    );
    expect(asyncStorageMock.setItem).toHaveBeenCalledWith(
      "codexBlocker.serverHost",
      "192.168.68.54"
    );
    expect(asyncStorageMock.setItem).toHaveBeenCalledWith(
      "codexBlocker.serverInstanceId",
      "instance-a"
    );
  });

  it("loads host/token/instance from mixed storage backends", async () => {
    asyncStorageMock.getItem.mockImplementation(async (key) => {
      if (key === "codexBlocker.serverHost") return "192.168.68.54";
      if (key === "codexBlocker.serverInstanceId") return "instance-a";
      return null;
    });
    secureStoreMock.getItemAsync.mockResolvedValue("token-123");

    const loaded = await loadConnection();
    expect(loaded).toEqual({
      host: "192.168.68.54",
      token: "token-123",
      instanceId: "instance-a",
    });
  });

  it("clears both host metadata and secure token", async () => {
    await clearConnection();

    expect(asyncStorageMock.removeItem).toHaveBeenCalledWith("codexBlocker.serverHost");
    expect(asyncStorageMock.removeItem).toHaveBeenCalledWith(
      "codexBlocker.serverInstanceId"
    );
    expect(secureStoreMock.deleteItemAsync).toHaveBeenCalledWith(
      "codexBlocker.serverToken"
    );
  });
});
