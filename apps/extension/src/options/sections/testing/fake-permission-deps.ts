import { fakeHostAccess } from "../../../access/testing/fake-host-access";
import { defaultSettings, type Settings } from "../../../settings/settings";
import { SETTINGS_KEY, SettingsStore } from "../../../settings/settings-store";
import { fakeStorageArea } from "../../../settings/testing/fake-storage-area";
import type { PermissionDeps } from "../permission-change";

export function fakePermissionDeps(settings: Partial<Settings> = {}, grants = true) {
  const storage = fakeStorageArea({ [SETTINGS_KEY]: { ...defaultSettings("en"), ...settings } });
  const store = new SettingsStore(storage.area, "en");
  const { access, origins } = fakeHostAccess({ grants });

  const deps: PermissionDeps = { access, update: (change) => store.update(change) };

  const current = async (): Promise<Settings> => (await store.load()).settings;

  return { access, origins, deps, storage, current };
}
