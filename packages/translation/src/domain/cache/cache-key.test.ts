import { describe, expect, test } from "bun:test";
import { Option } from "@lambe/kernel/option";
import { LanguageCode } from "../language/value-objects/language-code.vo";
import { cacheKey } from "./cache-key";

const language = (code: string): LanguageCode => LanguageCode.create(code).getValue();

const parts = {
  sourceMarkup: "Fork the <g1>repository</g1>.",
  source: Option.some(language("en")),
  target: language("fr"),
  host: "github.com",
  providerId: "ollama",
  model: "translategemma:12b",
  promptVersion: "1",
};

describe("cacheKey", () => {
  test("same_parts_give_the_same_key", () => {
    expect(cacheKey({ ...parts })).toBe(cacheKey(parts));
  });

  test("changing_prompt_version_or_model_or_target_is_a_cache_miss", () => {
    const original = cacheKey(parts);

    expect(cacheKey({ ...parts, promptVersion: "2" })).not.toBe(original);
    expect(cacheKey({ ...parts, model: "gemma3:12b" })).not.toBe(original);
    expect(cacheKey({ ...parts, target: language("de") })).not.toBe(original);
  });

  test("unknown_source_language_differs_from_a_known_one", () => {
    expect(cacheKey({ ...parts, source: Option.none() })).not.toBe(cacheKey(parts));
  });
});
