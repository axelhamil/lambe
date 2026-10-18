import { describe, expect, test } from "bun:test";
import { LanguageCode } from "./language-code.vo";

describe("LanguageCode", () => {
  test("accepts_fr_and_pt-BR", () => {
    expect(LanguageCode.create("fr").getValue().value).toBe("fr");
    expect(LanguageCode.create("pt-BR").getValue().value).toBe("pt-BR");
  });

  test("normalizes_FR_to_fr", () => {
    expect(LanguageCode.create("FR").getValue().value).toBe("fr");
    expect(LanguageCode.create("PT-BR").getValue().value).toBe("pt-BR");
  });

  test("rejects_free_text", () => {
    expect(LanguageCode.create("French").isFailure).toBe(true);
    expect(LanguageCode.create("fr BE").isFailure).toBe(true);
    expect(LanguageCode.create("").isFailure).toBe(true);
  });
});
