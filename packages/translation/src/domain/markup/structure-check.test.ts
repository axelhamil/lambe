import { describe, expect, test } from "bun:test";
import type { Result } from "@lambe/kernel/result";
import type { InlineNode } from "../block/inline-node";
import { type MarkupError, parseMarkup } from "./markup";
import { checkAgainstSource } from "./structure-check";

const source = parseMarkup("Run <x1/> or <g1>read <x2/></g1>").getValue();

const check = (translated: string): Result<InlineNode[], MarkupError> =>
  parseMarkup(translated).flatMap((nodes) => checkAgainstSource(source, nodes));

describe("checkAgainstSource", () => {
  test("accepts_reordered_words_around_atoms", () => {
    const checked = check("<g1>lis <x2/></g1> ou lance <x1/>");

    expect(checked.isSuccess).toBe(true);
  });

  test("rejects_lost_atom", () => {
    expect(check("Lance ou <g1>lis <x2/></g1>").getError().code).toBe("PLACEHOLDER_LOST");
  });

  test("rejects_duplicated_atom", () => {
    expect(check("Lance <x1/> <x1/> ou <g1>lis <x2/></g1>").getError().code).toBe(
      "PLACEHOLDER_DUPLICATED",
    );
  });

  test("rejects_lost_group_close", () => {
    expect(check("Lance <x1/> ou <g1>lis <x2/>").getError().code).toBe("MARKUP_MALFORMED");
  });

  test("rejects_atom_moved_out_of_its_group", () => {
    expect(check("Lance <x1/> ou <g1>lis</g1> <x2/>").getError().code).toBe("STRUCTURE_MOVED");
  });

  test("accepts_text_changes_inside_groups", () => {
    const checked = check("Lance <x1/> ou <g1>consulte la page <x2/> ici</g1>");

    expect(checked.getValue()).toEqual([
      { kind: "text", text: "Lance " },
      { kind: "atom", key: 1 },
      { kind: "text", text: " ou " },
      {
        kind: "group",
        key: 1,
        children: [
          { kind: "text", text: "consulte la page " },
          { kind: "atom", key: 2 },
          { kind: "text", text: " ici" },
        ],
      },
    ]);
  });

  test("rejects_key_absent_from_the_source", () => {
    expect(check("Lance <x1/> <x3/> ou <g1>lis <x2/></g1>").getError().code).toBe(
      "MARKUP_MALFORMED",
    );
  });

  test("drops_an_invented_leading_atom_from_a_plain_text_segment", () => {
    const plain = parseMarkup("Merge and close").getValue();
    const answer = parseMarkup("<x4/> Fusionner et fermer").getValue();

    expect(checkAgainstSource(plain, answer).getValue()).toEqual([
      { kind: "text", text: "Fusionner et fermer" },
    ]);
  });

  test("unwraps_a_group_moved_into_another_group", () => {
    const twoGroups = parseMarkup("<g1>a</g1> <g2>b</g2>").getValue();
    const moved = parseMarkup("<g1>a <g2>b</g2></g1>").getValue();

    expect(checkAgainstSource(twoGroups, moved).getValue()).toEqual([
      { kind: "group", key: 1, children: [{ kind: "text", text: "a b" }] },
    ]);
  });
});
