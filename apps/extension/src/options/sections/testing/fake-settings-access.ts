import { mock } from "bun:test";
import type { HostAccess } from "../../../access/host-access";
import { defaultSettings, type Settings } from "../../../settings/settings";
import { SETTINGS_KEY, SettingsStore } from "../../../settings/settings-store";
import { fakeStorageArea } from "../../../settings/testing/fake-storage-area";
import type { SettingsAccess } from "../permission-change";

export function fakeSettingsAccess(settings: Partial<Settings> = {}, grant = true) {
  const storage = fakeStorageArea({ [SETTINGS_KEY]: { ...defaultSettings("en"), ...settings } });
  const store = new SettingsStore(storage.area, "en");

  const access = {
    granted: mock(async () => []),
    request: mock(async () => grant),
    remove: mock(async () => true),
  } satisfies HostAccess;

  const deps: SettingsAccess = { access, update: (change) => store.update(change) };

  const current = async (): Promise<Settings> => (await store.load()).settings;

  return { access, deps, storage, current };
}
