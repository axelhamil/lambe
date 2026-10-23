import { describe, expect, test } from "bun:test";
import { defaultSettings } from "../settings/settings";
import { SETTINGS_KEY, SettingsStore } from "../settings/settings-store";
import { fakeStorageArea } from "../settings/testing/fake-storage-area";
import { runWithConsent } from "./consent-gate";

const storeWith = (consentAt: number | undefined): SettingsStore =>
  new SettingsStore(
    fakeStorageArea({ [SETTINGS_KEY]: { ...defaultSettings("en"), consentAt } }).area,
    "en",
  );

const run = async (consentAt: number | undefined) => {
  const done: string[] = [];

  await runWithConsent(
    storeWith(consentAt),
    () => done.push("translated"),
    () => done.push("settings opened"),
  );

  return done;
};

describe("runWithConsent", () => {
  test("bubble_click_before_consent_opens_the_settings_instead_of_translating", async () => {
    expect(await run(undefined)).toEqual(["settings opened"]);
  });

  test("bubble_click_after_consent_translates", async () => {
    expect(await run(1)).toEqual(["translated"]);
  });
});
