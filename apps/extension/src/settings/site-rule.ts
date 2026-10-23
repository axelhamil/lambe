import { z } from "zod";
import { webOriginOf } from "../access/web-origin";

const originSchema = z.string().refine(
  (value) =>
    webOriginOf(value)
      .filter((origin) => origin === value)
      .isSome(),
  "Site origin must look like https://example.com.",
);

export const siteRuleSchema = z.object({
  origin: originSchema,
  autoTranslate: z.boolean(),
  hideBubble: z.boolean(),
});

export type SiteRule = z.output<typeof siteRuleSchema>;

export function siteRuleOf(sites: SiteRule[], origin: string): SiteRule {
  return (
    sites.find((rule) => rule.origin === origin) ?? {
      origin,
      autoTranslate: false,
      hideBubble: false,
    }
  );
}

export function withSiteRule(sites: SiteRule[], rule: SiteRule): SiteRule[] {
  const others = sites.filter((existing) => existing.origin !== rule.origin);

  if (!rule.autoTranslate && !rule.hideBubble) return others;

  return [...others, rule];
}
