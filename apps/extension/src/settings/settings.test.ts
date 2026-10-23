import { describe, expect, test } from "bun:test";
import { defaultSettings, settingsSchema } from "./settings";

describe("settings", () => {
  test("defaults_follow_the_browser_ui_language", () => {
    const settings = defaultSettings("fr-FR");

    expect(settings.target).toBe("fr");
    expect(settings.version).toBe(1);
    expect(settings.consentAt).toBeUndefined();
    expect(settings.provider).toEqual({
      kind: "ollama",
      baseUrl: "http://localhost:11434",
      model: "translategemma:12b",
      concurrency: 8,
      timeoutMs: 120000,
    });
    expect(settings.bubbleEverywhere).toBe(false);
    expect(settings.youtube).toBe(false);
    expect(settings.sites).toEqual([]);
    expect(settings.debug).toBe(false);
  });

  test("unknown_ui_language_falls_back_to_english", () => {
    expect(defaultSettings("12-unknown").target).toBe("en");
    expect(defaultSettings("").target).toBe("en");
  });

  test("rejects_a_provider_base_url_that_is_not_http", () => {
    const defaults = defaultSettings("en");
    const withBaseUrl = (baseUrl: string) =>
      settingsSchema.safeParse({ ...defaults, provider: { ...defaults.provider, baseUrl } });

    expect(withBaseUrl("file:///etc/passwd").success).toBe(false);
    expect(withBaseUrl("javascript:alert(1)").success).toBe(false);
    expect(withBaseUrl("https://api.example.com").success).toBe(true);
  });
});
