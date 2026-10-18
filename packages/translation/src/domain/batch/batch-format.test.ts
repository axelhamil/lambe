import { describe, expect, test } from "bun:test";
import { decodeBatch, encodeBatch } from "./batch-format";

describe("batch format", () => {
  test("encode_writes_one_seg_line_per_segment", () => {
    expect(
      encodeBatch([
        { n: 1, markup: "Hello" },
        { n: 2, markup: "World" },
      ]),
    ).toBe('<seg n="1">Hello</seg>\n<seg n="2">World</seg>');
  });

  test("decode_extracts_segments_from_noisy_output", () => {
    const response = [
      "Here is the translation:",
      "```xml",
      '<seg n="1">Bonjour</seg>',
      '<seg n="2"> le monde </seg>',
      "```",
      "I kept every tag.",
    ].join("\n");

    expect(decodeBatch(response)).toEqual(
      new Map([
        [1, "Bonjour"],
        [2, "le monde"],
      ]),
    );
  });

  test("decode_ignores_unknown_and_unterminated_segments", () => {
    const response = [
      '<seg n="1">cut short',
      "<seg>no number</seg>",
      '<seg n="x">bad number</seg>',
      '<segment n="4">other tag</segment>',
      '<seg n="3">kept</seg>',
    ].join("\n");

    expect(decodeBatch(response)).toEqual(new Map([[3, "kept"]]));
  });

  test("decode_keeps_inner_tags_untouched", () => {
    const response = '<seg n="7">Lancez <x1/> puis <g1>ouvrez <g2>ceci</g2></g1> &amp; voilà</seg>';

    expect(decodeBatch(response).get(7)).toBe(
      "Lancez <x1/> puis <g1>ouvrez <g2>ceci</g2></g1> &amp; voilà",
    );
  });
});
