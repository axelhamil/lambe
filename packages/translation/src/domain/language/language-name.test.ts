import { describe, expect, test } from "bun:test";
import { languageName } from "./language-name";
import { LanguageCode } from "./value-objects/language-code.vo";

describe("languageName", () => {
  test("accepted_codes_that_intl_rejects_fall_back_to_the_code", () => {
    const codes = ["fr-12", "en-US-US"].filter((code) => LanguageCode.create(code).isSuccess);

    expect(codes).toEqual(["fr-12", "en-US-US"]);
    expect(codes.map((code) => languageName(code, ["en"]))).toEqual(codes);
    expect(languageName("fr", ["en"])).toBe("French");
  });
});
