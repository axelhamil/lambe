import { describe, expect, test } from "bun:test";
import { decodeBatch, decodeStreamedBatch, encodeBatch } from "./batch-format";

describe("batch format", () => {
  test("encode_writes_one_numbered_line_per_segment", () => {
    expect(
      encodeBatch([
        { n: 1, markup: "Hello" },
        { n: 2, markup: "World" },
      ]),
    ).toBe("[1] Hello\n[2] World");
  });

  test("markup_round_trips_through_the_numbered_line_format", () => {
    const segments = [
      { n: 1, markup: "Lancez <x1/> puis <g1>ouvrez <g2>ceci</g2></g1> &amp; voilà" },
      { n: 2, markup: "[3] is a footnote, not a number" },
      { n: 3, markup: "<g4>Fork</g4>" },
    ];

    expect(decodeBatch(encodeBatch(segments))).toEqual(
      new Map(segments.map(({ n, markup }) => [n, markup])),
    );
  });

  test("decode_extracts_segments_from_noisy_output", () => {
    const response = [
      "Here is the translation:",
      "```french",
      "[1] Bonjour",
      "`[2]  le monde ",
      "```",
      "",
      "I kept every tag.",
    ].join("\n");

    expect(decodeBatch(response)).toEqual(
      new Map([
        [1, "Bonjour"],
        [2, "le monde"],
      ]),
    );
  });

  test("decode_drops_a_segment_that_spills_onto_an_unnumbered_line", () => {
    const response = ["[1] Bonjour", "le monde", "[2] Au revoir", "[3] Encore"].join("\n");

    expect(decodeBatch(response)).toEqual(
      new Map([
        [2, "Au revoir"],
        [3, "Encore"],
      ]),
    );
  });

  test("decode_drops_a_segment_whose_number_repeats", () => {
    const response = ["[1] première moitié", "[1] seconde moitié", "[2] Au revoir"].join("\n");

    expect(decodeBatch(response)).toEqual(new Map([[2, "Au revoir"]]));
    expect(decodeStreamedBatch(`${response}\n[3] Enc`)).toEqual(new Map([[2, "Au revoir"]]));
  });

  test("decode_ignores_lines_without_a_number", () => {
    const response = ["[x] bad number", "(4) other marker", "[3] kept"].join("\n");

    expect(decodeBatch(response)).toEqual(new Map([[3, "kept"]]));
  });

  test("streamed_decode_holds_back_the_line_still_being_written", () => {
    expect(decodeStreamedBatch("[1] Bonjour.\n[2] Lan")).toEqual(new Map([[1, "Bonjour."]]));
    expect(decodeStreamedBatch("[1] Bonjour.\n")).toEqual(new Map());
  });
});
