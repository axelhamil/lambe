import { describe, expect, test } from "bun:test";
import { menuLanguages, withRecentTarget } from "./recent-targets";
import { RECENT_TARGETS_LIMIT } from "./settings";

describe("recent targets", () => {
  test("menu_lists_target_english_french_then_the_six_most_used", () => {
    const recent = ["ja", "de", "de", "fr", "it", "es", "es", "es", "pt", "nl", "ko", "ja", "de"];

    expect(menuLanguages("ru", recent).map((code) => code.value)).toEqual([
      "ru",
      "en",
      "fr",
      "de",
      "es",
      "ja",
      "it",
      "pt",
      "nl",
    ]);
  });

  test("recent_choices_stay_within_the_stored_limit", () => {
    const full = Array.from({ length: RECENT_TARGETS_LIMIT }, () => "de");

    expect(withRecentTarget(full, "es")).toHaveLength(RECENT_TARGETS_LIMIT);
    expect(withRecentTarget(full, "es")[0]).toBe("es");
  });
});
