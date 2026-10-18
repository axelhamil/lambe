import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { Result } from "../primitives/result";
import { ValueObject } from "./value-object";

const languagePairSchema = z.object({
  source: z.string().min(2, "Source language needs at least 2 letters."),
  target: z.string().min(2, "Target language needs at least 2 letters."),
});

type LanguagePairValue = z.infer<typeof languagePairSchema>;

class LanguagePair extends ValueObject<LanguagePairValue> {
  protected validate(value: LanguagePairValue): Result<LanguagePairValue, string> {
    const parsed = languagePairSchema.safeParse(value);

    if (!parsed.success) return Result.fail(parsed.error.issues[0]?.message ?? "Invalid pair.");

    return Result.ok(parsed.data);
  }
}

describe("ValueObject", () => {
  test("create_returns_failure_when_schema_rejects", () => {
    const result = LanguagePair.create({ source: "e", target: "fr" });

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBe("Source language needs at least 2 letters.");
  });

  test("create_returns_instance_when_valid", () => {
    const result = LanguagePair.create({ source: "en", target: "fr" });

    expect(result.getValue()).toBeInstanceOf(LanguagePair);
    expect(result.getValue().value).toEqual({ source: "en", target: "fr" });
  });

  test("value_is_frozen", () => {
    const pair = LanguagePair.create({ source: "en", target: "fr" }).getValue();

    expect(Object.isFrozen(pair.value)).toBe(true);
  });

  test("equals_compares_by_key_ordered_json_for_objects", () => {
    const left = LanguagePair.create({ source: "en", target: "fr" }).getValue();
    const reordered = LanguagePair.create({ target: "fr", source: "en" }).getValue();
    const other = LanguagePair.create({ source: "en", target: "de" }).getValue();

    expect(left.equals(reordered)).toBe(true);
    expect(left.equals(other)).toBe(false);
  });
});
