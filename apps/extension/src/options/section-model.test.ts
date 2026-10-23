import { describe, expect, test } from "bun:test";
import { hashOf, sectionFromHash } from "./section-model";

describe("section model", () => {
  test("hash_selects_the_section", () => {
    expect(sectionFromHash("#sites")).toBe("sites");
    expect(sectionFromHash(hashOf("privacy"))).toBe("privacy");
  });

  test("unknown_hash_selects_provider", () => {
    expect(sectionFromHash("")).toBe("provider");
    expect(sectionFromHash("#")).toBe("provider");
    expect(sectionFromHash("#constructor")).toBe("provider");
  });
});
