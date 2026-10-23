import { describe, expect, test } from "bun:test";
import { hashOf, NAV_GROUPS, SECTIONS, sectionFromHash } from "./section-model";

describe("section model", () => {
  test("hash_selects_the_section", () => {
    expect(sectionFromHash("#sites")).toBe("sites");
    expect(sectionFromHash(hashOf("privacy"))).toBe("privacy");
  });

  test("hash_with_a_query_selects_its_section", () => {
    expect(sectionFromHash("#sites?origin=https://example.org")).toBe("sites");
  });

  test("nav_groups_list_every_section_exactly_once", () => {
    const listed = NAV_GROUPS.flatMap((group) => group.sections);

    expect([...listed].sort()).toEqual([...SECTIONS].sort());
  });

  test("unknown_hash_selects_provider", () => {
    expect(sectionFromHash("")).toBe("provider");
    expect(sectionFromHash("#")).toBe("provider");
    expect(sectionFromHash("#constructor")).toBe("provider");
  });
});
