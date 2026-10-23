import { describe, expect, mock, test } from "bun:test";
import { OPTIONAL_HOSTS, YOUTUBE_MATCHES } from "../permissions";
import { defaultSettings, type Settings } from "../settings/settings";
import { SETTINGS_KEY, SettingsStore } from "../settings/settings-store";
import { fakeStorageArea } from "../settings/testing/fake-storage-area";
import type { HostAccess } from "./host-access";
import { reconcile } from "./reconcile";
import type { Registration } from "./registrations";
import type { ScriptRegistrar } from "./script-registrar";

const fakeChrome = (settings: Partial<Settings>, origins: string[]) => {
  const storage = fakeStorageArea({ [SETTINGS_KEY]: { ...defaultSettings("en"), ...settings } });
  const scripts = new Map<string, Registration>();
  const granted = [...origins];
  let staleSnapshot: Registration[] | undefined;

  const access: HostAccess = {
    granted: mock(async () => [...granted]),
    request: mock(async () => false),
    remove: mock(async () => false),
  };

  const registrar = {
    registered: mock(async () => {
      const snapshot = staleSnapshot ?? [...scripts.values()];

      staleSnapshot = undefined;

      return snapshot;
    }),
    register: mock(async (registrations: Registration[]) => {
      const duplicate = registrations.find((registration) => scripts.has(registration.id));

      if (duplicate !== undefined) throw new Error(`Duplicate script ID '${duplicate.id}'`);

      for (const registration of registrations) scripts.set(registration.id, registration);
    }),
    unregister: mock(async (ids: string[]) => {
      const missing = ids.find((id) => !scripts.has(id));

      if (missing !== undefined) throw new Error(`Nonexistent script ID '${missing}'`);

      for (const id of ids) scripts.delete(id);
    }),
  } satisfies ScriptRegistrar;

  const deps = { settings: new SettingsStore(storage.area, "en"), access, registrar };

  return {
    deps,
    registrar,
    ids: () => [...scripts.keys()].sort(),
    revoke: (origin: string) => granted.splice(granted.indexOf(origin), 1),
    serveStaleSnapshot: (snapshot: Registration[]) => {
      staleSnapshot = snapshot;
    },
    scripts,
    storage,
  };
};

describe("reconcile", () => {
  test("reconcile_is_idempotent", async () => {
    const chrome = fakeChrome({ bubbleEverywhere: true, youtube: true }, OPTIONAL_HOSTS);

    await reconcile(chrome.deps);
    await reconcile(chrome.deps);

    expect(chrome.ids()).toEqual(["lambe-page", "lambe-youtube", "lambe-youtube-main"]);
    expect(chrome.registrar.register).toHaveBeenCalledTimes(1);
    expect(chrome.registrar.unregister).not.toHaveBeenCalled();
  });

  test("removed_permission_unregisters_its_scripts", async () => {
    const chrome = fakeChrome({ youtube: true, bubbleEverywhere: true }, [
      ...OPTIONAL_HOSTS,
      ...YOUTUBE_MATCHES,
    ]);

    await reconcile(chrome.deps);
    chrome.revoke("http://*/*");
    await reconcile(chrome.deps);

    expect(chrome.ids()).toEqual(["lambe-youtube", "lambe-youtube-main"]);
    expect(chrome.storage.stored(SETTINGS_KEY)).toMatchObject({ bubbleEverywhere: true });
  });

  test("changed_registration_is_replaced", async () => {
    const chrome = fakeChrome({ youtube: true }, YOUTUBE_MATCHES);

    await reconcile(chrome.deps);

    const current = chrome.scripts.get("lambe-youtube");

    if (current === undefined) throw new Error("lambe-youtube should be registered");

    chrome.scripts.set("lambe-youtube", { ...current, css: [] });
    await reconcile(chrome.deps);

    expect(chrome.registrar.unregister).toHaveBeenCalledWith(["lambe-youtube"]);
    expect(chrome.scripts.get("lambe-youtube")).toEqual(current);
    expect(chrome.ids()).toEqual(["lambe-youtube", "lambe-youtube-main"]);
  });

  test("already_registered_id_does_not_throw", async () => {
    const chrome = fakeChrome({ youtube: true }, YOUTUBE_MATCHES);

    await reconcile(chrome.deps);
    chrome.serveStaleSnapshot([]);
    await reconcile(chrome.deps);

    expect(chrome.registrar.register).toHaveBeenCalledTimes(2);
    expect(chrome.ids()).toEqual(["lambe-youtube", "lambe-youtube-main"]);
  });

  test("already_removed_id_does_not_throw", async () => {
    const chrome = fakeChrome({ youtube: true }, YOUTUBE_MATCHES);

    await reconcile(chrome.deps);

    const snapshot = [...chrome.scripts.values()];

    chrome.scripts.clear();
    chrome.revoke(YOUTUBE_MATCHES[0] ?? "");
    chrome.serveStaleSnapshot(snapshot);
    await reconcile(chrome.deps);

    expect(chrome.ids()).toEqual([]);
  });
});
