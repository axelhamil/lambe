import { describe, expect, mock, test } from "bun:test";
import { type StorageAreaLike, StorageTranslationCache } from "./storage-translation-cache";

const byteSize = (key: string, value: unknown): number => key.length + JSON.stringify(value).length;

const memoryArea = (initial: Record<string, unknown> = {}): StorageAreaLike => {
  const items = new Map<string, unknown>(Object.entries(initial));

  return {
    get: mock(async (keys: string[]) =>
      Object.fromEntries(keys.flatMap((key) => (items.has(key) ? [[key, items.get(key)]] : []))),
    ),
    set: mock(async (entries: Record<string, string>) => {
      for (const [key, value] of Object.entries(entries)) items.set(key, value);
    }),
    getKeys: async () => [...items.keys()],
    getBytesInUse: async (keys: string[]) =>
      keys.reduce((total, key) => total + byteSize(key, items.get(key)), 0),
    remove: async (keys: string[]) => {
      for (const key of keys) items.delete(key);
    },
  };
};

const stored = {
  "lambe:settings": { version: 1 },
  "lambe:secrets": { apiKey: "sk-test" },
  "tc:one": "Bonjour",
  "tc:two": "Salut",
};

describe("StorageTranslationCache", () => {
  test("set_then_get_roundtrip", async () => {
    const cache = new StorageTranslationCache(memoryArea());

    await cache.setMany(new Map([["abc", "Bonjour"]]));

    expect(await cache.getMany(["abc"])).toEqual(new Map([["abc", "Bonjour"]]));
  });

  test("get_of_unknown_keys_returns_only_hits", async () => {
    const area = memoryArea();
    const cache = new StorageTranslationCache(area);

    await cache.setMany(new Map([["hit", "Salut"]]));
    const hits = await new StorageTranslationCache({
      ...area,
      get: async (keys) => ({ ...(await area.get(keys)), "tc:corrupt": 42 }),
    }).getMany(["hit", "miss", "corrupt"]);

    expect(hits).toEqual(new Map([["hit", "Salut"]]));
  });

  test("storage_failure_returns_empty_map_and_does_not_throw", async () => {
    const cache = new StorageTranslationCache({
      ...memoryArea(),
      get: mock(async () => Promise.reject(new Error("QUOTA_BYTES"))),
      set: mock(async () => Promise.reject(new Error("QUOTA_BYTES"))),
    });

    expect(await cache.getMany(["abc"])).toEqual(new Map());
    expect(await cache.setMany(new Map([["abc", "Bonjour"]]))).toBeUndefined();
  });

  test("size_counts_only_cache_entries", async () => {
    const cache = new StorageTranslationCache(memoryArea(stored));

    expect(await cache.size()).toEqual({
      entries: 2,
      bytes: byteSize("tc:one", "Bonjour") + byteSize("tc:two", "Salut"),
    });
  });

  test("clear_keeps_settings_and_secrets", async () => {
    const area = memoryArea(stored);
    const cache = new StorageTranslationCache(area);

    await cache.clear();

    expect(await area.getKeys()).toEqual(["lambe:settings", "lambe:secrets"]);
    expect(await cache.size()).toEqual({ entries: 0, bytes: 0 });
  });
});
