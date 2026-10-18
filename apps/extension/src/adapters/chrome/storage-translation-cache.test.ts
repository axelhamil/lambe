import { describe, expect, mock, test } from "bun:test";
import { type StorageAreaLike, StorageTranslationCache } from "./storage-translation-cache";

const memoryArea = (): StorageAreaLike => {
  const items = new Map<string, unknown>();

  return {
    get: mock(async (keys: string[]) =>
      Object.fromEntries(keys.flatMap((key) => (items.has(key) ? [[key, items.get(key)]] : []))),
    ),
    set: mock(async (entries: Record<string, string>) => {
      for (const [key, value] of Object.entries(entries)) items.set(key, value);
    }),
  };
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
      get: async (keys) => ({ ...(await area.get(keys)), "tc:corrupt": 42 }),
      set: area.set,
    }).getMany(["hit", "miss", "corrupt"]);

    expect(hits).toEqual(new Map([["hit", "Salut"]]));
  });

  test("storage_failure_returns_empty_map_and_does_not_throw", async () => {
    const cache = new StorageTranslationCache({
      get: mock(async () => Promise.reject(new Error("QUOTA_BYTES"))),
      set: mock(async () => Promise.reject(new Error("QUOTA_BYTES"))),
    });

    expect(await cache.getMany(["abc"])).toEqual(new Map());
    expect(await cache.setMany(new Map([["abc", "Bonjour"]]))).toBeUndefined();
  });
});
