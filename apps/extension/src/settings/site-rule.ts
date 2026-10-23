import { z } from "zod";

const WEB_SCHEMES = new Set(["http:", "https:"]);

const originSchema = z.string().refine((value) => {
  const url = URL.parse(value);

  return url !== null && WEB_SCHEMES.has(url.protocol) && url.origin === value;
}, "Site origin must look like https://example.com.");

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
