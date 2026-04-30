import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_PREFIX = "stage_v0_";

export async function loadStorage<T>(key: string, fallback: T): Promise<T> {
  try {
    const v = await AsyncStorage.getItem(STORAGE_PREFIX + key);
    if (v == null) return fallback;
    const parsed = JSON.parse(v);
    if (parsed === null || parsed === undefined) return fallback;
    return parsed as T;
  } catch (e) {
    console.warn(`[storage] load failed for ${key}, using fallback:`, e);
    return fallback;
  }
}

export async function saveStorage<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch (e) {
    console.error(`[storage] save failed for ${key}:`, e);
  }
}

export async function resetAllStorage(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ours = keys.filter(k => k.startsWith(STORAGE_PREFIX));
    await AsyncStorage.multiRemove(ours);
  } catch (e) {
    console.error("[storage] reset failed:", e);
  }
}
