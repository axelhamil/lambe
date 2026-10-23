import { describe, expect, test } from "bun:test";
import { Option } from "@lambe/kernel/option";
import { shouldSkipBlock } from "./skip-policy";
import { LanguageCode } from "./value-objects/language-code.vo";

const language = (code: string): LanguageCode => LanguageCode.create(code).getValue();

describe("shouldSkipBlock", () => {
  test("skips_a_reliable_target_language_block", () => {
    const skipped = shouldSkipBlock({
      detected: Option.some(language("fr")),
      target: language("fr"),
      charCount: 12,
    });

    expect(skipped).toBe(true);
  });

  test("does_not_skip_short_blocks_even_if_target", () => {
    const skipped = shouldSkipBlock({
      detected: Option.some(language("fr")),
      target: language("fr"),
      charCount: 11,
    });

    expect(skipped).toBe(false);
  });

  test("does_not_skip_when_detection_is_none", () => {
    const skipped = shouldSkipBlock({
      detected: Option.none(),
      target: language("fr"),
      charCount: 500,
    });

    expect(skipped).toBe(false);
  });

  test("pt-BR_target_skips_pt_detection", () => {
    const skipped = shouldSkipBlock({
      detected: Option.some(language("pt")),
      target: language("pt-BR"),
      charCount: 40,
    });

    expect(skipped).toBe(true);
    expect(
      shouldSkipBlock({
        detected: Option.some(language("en")),
        target: language("pt-BR"),
        charCount: 40,
      }),
    ).toBe(false);
  });
});
