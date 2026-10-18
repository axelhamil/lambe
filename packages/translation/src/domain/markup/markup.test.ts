import { describe, expect, test } from "bun:test";
import type { InlineNode } from "../block/inline-node";
import { parseMarkup, toMarkup } from "./markup";

describe("markup", () => {
  test("roundtrips_text_atoms_and_nested_groups", () => {
    const nodes: InlineNode[] = [
      { kind: "text", text: "Run " },
      { kind: "atom", key: 1 },
      { kind: "text", text: " or " },
      {
        kind: "group",
        key: 1,
        children: [
          { kind: "text", text: "read " },
          { kind: "group", key: 2, children: [{ kind: "atom", key: 2 }] },
        ],
      },
    ];

    const markup = toMarkup(nodes);

    expect(markup).toBe("Run <x1/> or <g1>read <g2><x2/></g2></g1>");
    expect(parseMarkup(markup).getValue()).toEqual(nodes);
  });

  test("escapes_angle_brackets_and_ampersands", () => {
    const nodes: InlineNode[] = [{ kind: "text", text: "a < b && c > d &lt;" }];

    const markup = toMarkup(nodes);

    expect(markup).toBe("a &lt; b &amp;&amp; c &gt; d &amp;lt;");
    expect(parseMarkup(markup).getValue()).toEqual(nodes);
  });

  test("collapses_whitespace_and_trims_edges", () => {
    const nodes: InlineNode[] = [
      { kind: "text", text: "\n  Hello \t\n world  " },
      { kind: "atom", key: 1 },
      { kind: "text", text: "  end \n" },
    ];

    expect(toMarkup(nodes)).toBe("Hello world <x1/> end");
  });

  test("parse_rejects_unclosed_group", () => {
    const parsed = parseMarkup("Run <g1>read <x2/>");

    expect(parsed.getError().code).toBe("MARKUP_MALFORMED");
  });

  test("parse_rejects_crossed_tags", () => {
    const parsed = parseMarkup("<g1>a <g2>b</g1> c</g2>");

    expect(parsed.getError().code).toBe("MARKUP_MALFORMED");
  });

  test("keeps_non_breaking_spaces", () => {
    const nodes: InlineNode[] = [{ kind: "text", text: "\u00a0Bonjour\u00a0! Ça va\u00a0?\u00a0" }];

    expect(toMarkup(nodes)).toBe("\u00a0Bonjour\u00a0! Ça va\u00a0?\u00a0");
  });

  test("decodes_common_and_numeric_entities", () => {
    const parsed = parseMarkup("&quot;a&quot; &#39;b&apos; c&nbsp;d &#233;&#xE9;&#X1F600;");

    expect(parsed.getValue()).toEqual([{ kind: "text", text: "\"a\" 'b' c\u00a0d éé\u{1F600}" }]);
  });

  test("parse_rejects_unknown_named_entity", () => {
    expect(parseMarkup("a &hellip; b").getError().code).toBe("MARKUP_MALFORMED");
    expect(parseMarkup("<g1>a &copy;</g1>").getError().code).toBe("MARKUP_MALFORMED");
    expect(parseMarkup("a & b; c").getValue()).toEqual([{ kind: "text", text: "a & b; c" }]);
  });

  test("parse_rejects_close_without_open_and_adversarial_tags", () => {
    for (const markup of ["a</g1>", "a <x1 /> b", "a <X1/> b", '<g1 class="a">b</g1>']) {
      expect(parseMarkup(markup).getError().code).toBe("MARKUP_MALFORMED");
    }
  });
});
