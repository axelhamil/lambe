import { describe, expect, test } from "bun:test";
import type { InlineNode } from "../block/inline-node";
import { toMarkup } from "../markup/markup";
import { estimateTokens } from "./budget";
import { splitNodes, splitText } from "./split";

const sentences = (count: number, label: string): string =>
  Array.from(
    { length: count },
    (_, index) => `${label} sentence ${index + 1} talks about forks.`,
  ).join(" ");

const markupOf = (pieces: InlineNode[][]): string => pieces.map(toMarkup).join(" ");

describe("splitNodes", () => {
  test("splits_a_9000_char_paragraph_into_pieces_under_budget", () => {
    const nodes: InlineNode[] = [
      { kind: "text", text: `${sentences(130, "Lead")} See ` },
      { kind: "group", key: 1, children: [{ kind: "text", text: "the guide" }] },
      { kind: "text", text: ` and run ` },
      { kind: "atom", key: 1 },
      { kind: "text", text: `. ${sentences(130, "Tail")}` },
    ];
    expect(toMarkup(nodes).length).toBeGreaterThan(9000);

    const pieces = splitNodes(nodes, 200).getValue();

    expect(pieces.length).toBeGreaterThan(1);

    for (const piece of pieces) expect(estimateTokens(toMarkup(piece))).toBeLessThanOrEqual(200);

    expect(markupOf(pieces)).toBe(toMarkup(nodes));
  });

  test("never_cuts_inside_a_group_or_atom", () => {
    const group: InlineNode = {
      kind: "group",
      key: 1,
      children: [{ kind: "text", text: "Inner one is here. Inner two is here. Inner three." }],
    };
    const nodes: InlineNode[] = [
      { kind: "text", text: "First sentence is here. Second sentence is here. " },
      group,
      { kind: "text", text: " Then " },
      { kind: "atom", key: 1 },
      { kind: "text", text: " runs. Last sentence is here." },
    ];

    const pieces = splitNodes(nodes, 25).getValue();

    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.filter((piece) => piece.includes(group))).toHaveLength(1);
    expect(pieces.filter((piece) => piece.some((node) => node.kind === "atom"))).toHaveLength(1);
    expect(markupOf(pieces)).toBe(toMarkup(nodes));
  });

  test("giant_group_returns_SEGMENT_TOO_LONG", () => {
    const nodes: InlineNode[] = [
      { kind: "text", text: "Intro. " },
      { kind: "group", key: 1, children: [{ kind: "text", text: sentences(200, "Inner") }] },
    ];

    const result = splitNodes(nodes, 200);

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toEqual({ code: "SEGMENT_TOO_LONG" });
  });
});

describe("splitText", () => {
  test("splitText_prefers_sentence_boundaries", () => {
    const text = "One two three four. Five six seven eight. Nine ten.";

    const pieces = splitText(text, 10);

    expect(pieces).toEqual(["One two three four. ", "Five six seven eight. ", "Nine ten."]);
  });

  test("splitText_falls_back_to_whitespace_inside_a_long_sentence", () => {
    const text = "alpha beta gamma delta epsilon zeta eta theta";

    const pieces = splitText(text, 5);

    expect(pieces.join("")).toBe(text);
    expect(pieces.every((piece) => estimateTokens(piece) <= 5)).toBe(true);
    expect(pieces.flatMap((piece) => piece.trim().split(" "))).toEqual(text.split(" "));
    expect(pieces[0]).toBe("alpha beta ");
  });

  test("splitText_hard_splits_a_word_longer_than_budget", () => {
    const word = "x".repeat(20);

    const pieces = splitText(`ok ${word}`, 3);

    expect(pieces.join("")).toBe(`ok ${word}`);
    expect(pieces.every((piece) => estimateTokens(piece) <= 3)).toBe(true);
    expect(pieces.slice(1)).toEqual(["xxxxxxxxx", "xxxxxxxxx", "xx"]);
  });
});
