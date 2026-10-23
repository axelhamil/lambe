import { describe, expect, test } from "bun:test";
import { browserLanguage, languageOptions, searchLanguages } from "./languages";

const codesOf = (options: { code: string }[]): string[] => options.map(({ code }) => code);

describe("languages", () => {
  test("labels_follow_the_ui_language", () => {
    const french = languageOptions("fr-FR");
    const english = languageOptions("en-US");

    expect(french.find(({ code }) => code === "de")?.label).toBe("Allemand");
    expect(english.find(({ code }) => code === "de")?.label).toBe("German");
    expect(french.map(({ label }) => label)).toEqual(
      french.map(({ label }) => label).toSorted((a, b) => a.localeCompare(b, "fr")),
    );
  });

  test("search_ignores_case_and_diacritics", () => {
    const french = languageOptions("fr");

    expect(codesOf(searchLanguages(french, "FRANCAIS"))).toEqual(["fr"]);
    expect(codesOf(searchLanguages(french, "  néer"))).toEqual(["nl"]);
    expect(searchLanguages(french, "")).toEqual(french);
  });

  test("default_target_comes_from_the_browser_language", () => {
    expect(browserLanguage(languageOptions("pt-BR"), "pt-BR").unwrap().code).toBe("pt-BR");
    expect(browserLanguage(languageOptions("de-AT"), "de-AT").unwrap().code).toBe("de");
    expect(browserLanguage(languageOptions("en"), "xx").isNone()).toBe(true);
  });
});
