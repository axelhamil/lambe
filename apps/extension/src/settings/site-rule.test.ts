import { describe, expect, test } from "bun:test";
import { siteRuleOf, withSiteRule } from "./site-rule";

const ORIGIN = "https://example.com";

describe("site rules", () => {
  test("unknown_origin_gets_the_default_rule", () => {
    const sites = [{ origin: "https://other.org", autoTranslate: true, hideBubble: false }];

    expect(siteRuleOf(sites, ORIGIN)).toEqual({
      origin: ORIGIN,
      autoTranslate: false,
      hideBubble: false,
    });
  });

  test("rule_with_both_flags_off_is_removed", () => {
    const sites = withSiteRule([], { origin: ORIGIN, autoTranslate: true, hideBubble: false });

    expect(siteRuleOf(sites, ORIGIN).autoTranslate).toBe(true);
    expect(
      withSiteRule(sites, { origin: ORIGIN, autoTranslate: false, hideBubble: false }),
    ).toEqual([]);
  });
});
