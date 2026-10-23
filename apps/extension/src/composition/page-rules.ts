import { LanguageCode } from "@lambe/translation/domain/language/value-objects/language-code.vo";
import { isConsented } from "../activation/consent-gate";
import { toRuntimeConfig } from "../config/runtime-config";
import type { Settings } from "../settings/settings";
import type { SettingsStore } from "../settings/settings-store";
import { siteRuleOf } from "../settings/site-rule";

export interface PageRules {
  hideBubble: boolean;
  autoTranslate: boolean;
  target: LanguageCode;
}

export function pageRulesFor(settings: Settings, origin: string): PageRules {
  const rule = siteRuleOf(settings.sites, origin);

  return {
    hideBubble: rule.hideBubble,
    autoTranslate: rule.autoTranslate && isConsented(settings),
    target: toRuntimeConfig(settings).target,
  };
}

export function pageNeedsTranslation(rules: PageRules, pageLanguage: string): boolean {
  if (!rules.autoTranslate) return false;

  return LanguageCode.create(pageLanguage).match({
    ok: (language) => !language.sharesPrimarySubtagWith(rules.target),
    fail: () => true,
  });
}

export async function followPageRules(
  store: SettingsStore,
  origin: string,
  listener: (rules: PageRules) => void,
): Promise<() => void> {
  const stop = store.subscribe(({ settings }) => listener(pageRulesFor(settings, origin)));
  const { settings } = await store.load();

  listener(pageRulesFor(settings, origin));

  return stop;
}
