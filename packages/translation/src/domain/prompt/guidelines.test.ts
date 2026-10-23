import { describe, expect, mock, test } from "bun:test";
import { DEFAULT_GUIDELINES, guidelinesIdOf } from "./guidelines";

const CUSTOM = "Use formal French and keep product names in English.";

const hasher = {
  sha256Hex: mock(async (input: string) =>
    input === CUSTOM ? "0123456789abcdef".repeat(4) : "f".repeat(64),
  ),
};

describe("guidelinesIdOf", () => {
  test("empty_text_has_no_id", async () => {
    expect(await guidelinesIdOf("", hasher)).toBe("");
  });

  test("default_text_has_no_id", async () => {
    expect(await guidelinesIdOf(DEFAULT_GUIDELINES, hasher)).toBe("");
  });

  test("custom_text_has_a_stable_twelve_char_id", async () => {
    const id = await guidelinesIdOf(CUSTOM, hasher);

    expect(id).toBe("0123456789ab");
    expect(await guidelinesIdOf(CUSTOM, hasher)).toBe(id);
  });
});
