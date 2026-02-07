import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import type { MobilePreferences } from "../types";

const SERVER_HOST_KEY = "codexBlocker.serverHost";
const SERVER_TOKEN_KEY = "codexBlocker.serverToken";
const SERVER_INSTANCE_ID_KEY = "codexBlocker.serverInstanceId";
const PREFERENCES_KEY = "codexBlocker.preferences";

export type PersistedConnection = {
  host: string | null;
  token: string | null;
  instanceId: string | null;
};

export const DEFAULT_PREFERENCES: MobilePreferences = {
  notificationsEnabled: false,
  blockingEnabled: false,
};

async function clearLegacyTokenStorage(): Promise<void> {
  await Promise.all([
    AsyncStorage.removeItem(SERVER_TOKEN_KEY),
    SecureStore.deleteItemAsync(SERVER_TOKEN_KEY),
  ]);
}

export async function loadConnection(): Promise<PersistedConnection> {
  const [host, instanceId] = await Promise.all([
    AsyncStorage.getItem(SERVER_HOST_KEY),
    AsyncStorage.getItem(SERVER_INSTANCE_ID_KEY),
  ]);
  await clearLegacyTokenStorage();
  return {
    host,
    token: null,
    instanceId,
  };
}

export async function saveConnection(host: string, instanceId: string): Promise<void> {
  await Promise.all([
    AsyncStorage.setItem(SERVER_HOST_KEY, host),
    AsyncStorage.setItem(SERVER_INSTANCE_ID_KEY, instanceId),
  ]);
}

export async function clearConnection(): Promise<void> {
  await Promise.all([
    AsyncStorage.removeItem(SERVER_HOST_KEY),
    AsyncStorage.removeItem(SERVER_INSTANCE_ID_KEY),
    clearLegacyTokenStorage(),
  ]);
}

export async function loadPreferences(): Promise<MobilePreferences> {
  const raw = await AsyncStorage.getItem(PREFERENCES_KEY);
  if (!raw) return DEFAULT_PREFERENCES;
  try {
    const parsed = JSON.parse(raw) as Partial<MobilePreferences>;
    return {
      notificationsEnabled: Boolean(parsed.notificationsEnabled),
      blockingEnabled: Boolean(parsed.blockingEnabled),
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export async function savePreferences(preferences: MobilePreferences): Promise<void> {
  await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
}
