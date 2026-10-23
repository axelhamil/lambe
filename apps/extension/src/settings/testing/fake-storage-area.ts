import type { SecretsArea } from "../secrets-store";
import type { SettingsArea, StorageChanges } from "../settings-store";

export function fakeStorageArea(initial: Record<string, unknown> = {}) {
  const items = new Map(Object.entries(initial));
  const listeners = new Set<(changes: StorageChanges) => void>();
  const writes: Record<string, unknown>[] = [];

  const area = {
    get: async (keys: string[]) =>
      Object.fromEntries(keys.flatMap((key) => (items.has(key) ? [[key, items.get(key)]] : []))),
    set: async (next: Record<string, unknown>) => {
      writes.push(next);

      for (const [key, value] of Object.entries(next)) items.set(key, value);
    },
    remove: async (key: string) => {
      items.delete(key);
    },
    onChanged: {
      addListener: (listener: (changes: StorageChanges) => void) => {
        listeners.add(listener);
      },
      removeListener: (listener: (changes: StorageChanges) => void) => {
        listeners.delete(listener);
      },
    },
  } satisfies SettingsArea & SecretsArea;

  const changeFromElsewhere = (changes: StorageChanges): void => {
    for (const [key, change] of Object.entries(changes)) items.set(key, change.newValue);

    for (const listener of listeners) listener(changes);
  };

  return { area, writes, stored: (key: string) => items.get(key), changeFromElsewhere };
}
