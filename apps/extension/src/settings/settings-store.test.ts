import { describe, expect, mock, test } from "bun:test";
import { defaultSettings } from "./settings";
import { type LoadedSettings, SETTINGS_KEY, SettingsStore } from "./settings-store";
import { fakeStorageArea } from "./testing/fake-storage-area";

const storeOver = (initial: Record<string, unknown> = {}) => {
  const storage = fakeStorageArea(initial);

  return { storage, store: new SettingsStore(storage.area, "fr-FR") };
};

describe("SettingsStore", () => {
  test("missing_settings_load_as_defaults_without_a_problem", async () => {
    const { store, storage } = storeOver();

    const loaded = await store.load();

    expect(loaded.settings).toEqual(defaultSettings("fr-FR"));
    expect(loaded.problem.isNone()).toBe(true);
    expect(storage.writes).toEqual([]);
  });

  test("invalid_stored_settings_are_reported_not_dropped", async () => {
    const broken = { ...defaultSettings("en"), provider: { kind: "ollama", concurrency: 0 } };
    const { store, storage } = storeOver({ [SETTINGS_KEY]: broken });

    const loaded = await store.load();
    const problem = loaded.problem.toUndefined();
    const refused = await store.update((current) => ({ ...current, debug: true }));

    expect(loaded.settings).toEqual(defaultSettings("fr-FR"));
    expect(problem?.code).toBe("SETTINGS_INVALID");
    expect(problem?.issues.some((issue) => issue.startsWith("provider.concurrency"))).toBe(true);
    expect(refused.isFailure).toBe(true);
    expect(storage.stored(SETTINGS_KEY)).toEqual(broken);
    expect(storage.writes).toEqual([]);
  });

  test("settings_from_a_newer_version_are_not_overwritten", async () => {
    const future = { version: 2, somethingNew: true };
    const { store, storage } = storeOver({ [SETTINGS_KEY]: future });

    const loaded = await store.load();
    const refused = await store.update((current) => ({ ...current, debug: true }));

    expect(loaded.problem.toUndefined()?.code).toBe("SETTINGS_FROM_NEWER_VERSION");
    expect(loaded.settings).toEqual(defaultSettings("fr-FR"));
    expect(refused.isFailure).toBe(true);
    expect(storage.stored(SETTINGS_KEY)).toEqual(future);

    const fixed = await store.save(defaultSettings("en"));

    expect(fixed.isSuccess).toBe(true);
    expect((await store.load()).problem.isNone()).toBe(true);
  });

  test("update_merges_and_persists", async () => {
    const { store, storage } = storeOver();

    const updated = await store.update((current) => ({ ...current, youtube: true }));
    const loaded = await store.load();

    expect(updated.isSuccess).toBe(true);
    expect(loaded.settings).toEqual({ ...defaultSettings("fr-FR"), youtube: true });
    expect(storage.stored(SETTINGS_KEY)).toEqual(loaded.settings);
  });

  test("save_refuses_settings_that_fail_validation", async () => {
    const { store, storage } = storeOver();
    const defaults = defaultSettings("en");

    const saved = await store.save({ ...defaults, provider: { ...defaults.provider, model: "" } });

    expect(saved.isFailure).toBe(true);
    expect(saved.getError().code).toBe("SETTINGS_INVALID");
    expect(storage.writes).toEqual([]);
  });

  test("subscribe_fires_on_storage_changes_from_other_contexts", () => {
    const { store, storage } = storeOver();
    const listener = mock((_loaded: LoadedSettings) => {});

    store.subscribe(listener);
    storage.changeFromElsewhere({ unrelated: { newValue: 1 } });
    storage.changeFromElsewhere({
      [SETTINGS_KEY]: { newValue: { ...defaultSettings("en"), debug: true } },
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0]).toMatchObject({ settings: { debug: true, target: "en" } });
  });

  test("unsubscribe_stops_notifications", () => {
    const { store, storage } = storeOver();
    const listener = mock((_loaded: LoadedSettings) => {});

    const unsubscribe = store.subscribe(listener);

    unsubscribe();
    storage.changeFromElsewhere({ [SETTINGS_KEY]: { newValue: defaultSettings("en") } });

    expect(listener).not.toHaveBeenCalled();
  });

  test("v0_shaped_legacy_override_is_migrated", async () => {
    const { store, storage } = storeOver({
      "lambe:config": {
        target: "pt-BR",
        provider: { model: "qwen3:8b", timeoutMs: 5000 },
        contextTokens: 4096,
      },
    });

    const loaded = await store.load();
    const defaults = defaultSettings("fr-FR");
    const expected = {
      ...defaults,
      target: "pt-BR",
      provider: { ...defaults.provider, model: "qwen3:8b", timeoutMs: 5000 },
    };

    expect(loaded.problem.isNone()).toBe(true);
    expect(loaded.settings).toEqual(expected);
    expect(storage.stored(SETTINGS_KEY)).toEqual(expected);

    await store.load();

    expect(storage.writes).toHaveLength(1);
  });

  test("unreadable_storage_loads_defaults", async () => {
    const { storage } = storeOver();
    const store = new SettingsStore(
      { ...storage.area, get: async () => Promise.reject(new Error("storage down")) },
      "de",
    );

    const loaded = await store.load();

    expect(loaded.settings.target).toBe("de");
    expect(loaded.problem.isNone()).toBe(true);
  });
});
