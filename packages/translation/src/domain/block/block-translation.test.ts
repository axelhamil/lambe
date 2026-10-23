import { describe, expect, test } from "bun:test";
import { textNodeCount, textSlots } from "./block-translation";
import type { InlineNode } from "./inline-node";

describe("textSlots", () => {
  test("textSlots_follows_depth_first_order", () => {
    const nodes: InlineNode[] = [
      { kind: "text", text: "a" },
      {
        kind: "group",
        key: 1,
        children: [
          { kind: "text", text: "b" },
          { kind: "group", key: 2, children: [{ kind: "text", text: "c" }] },
          { kind: "atom", key: 1 },
          { kind: "text", text: "d" },
        ],
      },
      { kind: "text", text: "e" },
    ];

    expect(textSlots(nodes)).toEqual(["a", "b", "c", "d", "e"]);
    expect(textNodeCount(nodes)).toBe(5);
  });
});
