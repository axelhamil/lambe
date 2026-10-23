import { describe, expect, test } from "bun:test";
import { defaultSettings, type Settings } from "../settings/settings";
import { SETTINGS_KEY, SettingsStore } from "../settings/settings-store";
import { fakeStorageArea } from "../settings/testing/fake-storage-area";
import {
  bubbleVisible,
  followPageRules,
  type PageRules,
  pageNeedsTranslation,
  pageRulesFor,
} from "./page-rules";

const SITE = "https://news.example";

const OTHER = "https://blog.example";

const consented = (change: Partial<Settings>): Settings => ({
  ...defaultSettings("en"),
  consentAt: 1,
  target: "fr",
  ...change,
});

describe("pageRulesFor", () => {
  test("hide_bubble_rule_applies_to_its_origin_only", () => {
    const settings = consented({
      sites: [{ origin: SITE, autoTranslate: false, hideBubble: true }],
    });

    expect(pageRulesFor(settings, SITE).hideBubble).toBe(true);
    expect(pageRulesFor(settings, OTHER).hideBubble).toBe(false);
  });

  test("bubble_shows_only_on_the_exact_origin_of_a_rule_unless_activated", () => {
    const settings = consented({
      sites: [{ origin: "http://localhost:3000", autoTranslate: true, hideBubble: false }],
    });
    const ruled = pageRulesFor(settings, "http://localhost:3000");
    const otherPort = pageRulesFor(settings, "http://localhost:11434");
    const everywhere = pageRulesFor({ ...settings, bubbleEverywhere: true }, OTHER);

    expect(bubbleVisible(ruled, false)).toBe(true);
    expect(bubbleVisible(otherPort, false)).toBe(false);
    expect(bubbleVisible(otherPort, true)).toBe(true);
    expect(bubbleVisible(everywhere, false)).toBe(true);
  });

  test("auto_translate_requires_consent", () => {
    const sites = [{ origin: SITE, autoTranslate: true, hideBubble: false }];

    const before = pageRulesFor(consented({ sites, consentAt: undefined }), SITE);
    const after = pageRulesFor(consented({ sites }), SITE);

    expect(before.autoTranslate).toBe(false);
    expect(after.autoTranslate).toBe(true);
    expect(pageNeedsTranslation(after, "en-US")).toBe(true);
    expect(pageNeedsTranslation(after, "fr-FR")).toBe(false);
    expect(pageNeedsTranslation(before, "en-US")).toBe(false);
  });

  test("target_change_applies_to_the_next_translation_without_reload", async () => {
    const storage = fakeStorageArea({ [SETTINGS_KEY]: consented({}) });
    const seen: PageRules[] = [];

    const stop = await followPageRules(new SettingsStore(storage.area, "en"), SITE, (rules) =>
      seen.push(rules),
    );
    storage.changeFromElsewhere({ [SETTINGS_KEY]: { newValue: consented({ target: "es" }) } });
    stop();
    storage.changeFromElsewhere({ [SETTINGS_KEY]: { newValue: consented({ target: "de" }) } });

    expect(seen.map((rules) => rules.target.value)).toEqual(["fr", "es"]);
  });
});
