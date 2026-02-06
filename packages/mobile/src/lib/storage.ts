import AsyncStorage from "@react-native-async-storage/async-storage";
import type { MobilePreferences } from "../types";

const SERVER_HOST_KEY = "codexBlocker.serverHost";
const SERVER_TOKEN_KEY = "codexBlocker.serverToken";
const PREFERENCES_KEY = "codexBlocker.preferences";

export type PersistedConnection = {
  host: string | null;
  token: string | null;
};

export const DEFAULT_PREFERENCES: MobilePreferences = {
  notificationsEnabled: false,
  blockingEnabled: false,
};

export async function loadConnection(): Promise<PersistedConnection> {
  const [host, token] = await Promise.all([
    AsyncStorage.getItem(SERVER_HOST_KEY),
    AsyncStorage.getItem(SERVER_TOKEN_KEY),
  ]);
  return {
    host,
    token,
  };
}

export async function saveConnection(host: string, token: string): Promise<void> {
  await Promise.all([
    AsyncStorage.setItem(SERVER_HOST_KEY, host),
    AsyncStorage.setItem(SERVER_TOKEN_KEY, token),
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
