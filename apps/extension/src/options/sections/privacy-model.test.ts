import { describe, expect, test } from "bun:test";
import { defaultSettings } from "../../settings/settings";
import { SETTINGS_KEY, SettingsStore } from "../../settings/settings-store";
import { fakeStorageArea } from "../../settings/testing/fake-storage-area";
import { privacyModel } from "./privacy-model";

describe("privacy settings", () => {
  test("withdrawing_consent_clears_consent_at", async () => {
    const storage = fakeStorageArea({
      [SETTINGS_KEY]: { ...defaultSettings("en"), consentAt: 1_760_000_000_000 },
    });
    const store = new SettingsStore(storage.area, "en");
    const model = privacyModel({
      settings: (await store.load()).settings,
      update: (change) => store.update(change),
      manifest: () => ({ version: "1.2.0" }),
    });

    expect(model.consentAt().isSome()).toBe(true);

    await model.withdraw();

    expect((await store.load()).settings.consentAt).toBeUndefined();
  });
});
