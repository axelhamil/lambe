import type { LanguageCode } from "@lambe/translation/domain/language/value-objects/language-code.vo";
import type { MenuActions } from "../bubble/bubble-menu";
import type { OpenOptionsMessage } from "../messaging/open-options.contract";
import { withRecentTarget } from "../settings/recent-targets";
import type { Settings } from "../settings/settings";
import type { SettingsStore } from "../settings/settings-store";
import { siteRuleOf, withSiteRule } from "../settings/site-rule";

interface MenuActionDeps {
  origin: string;
  settings: SettingsStore;
  translateWith(language: LanguageCode): void;
  sendToWorker(message: OpenOptionsMessage): void;
}

export function menuActions(deps: MenuActionDeps): MenuActions {
  const save = (change: (current: Settings) => Settings, failure: string): void => {
    void deps.settings
      .update(change)
      .then((saved) => {
        if (saved.isFailure) console.warn(failure, saved.getError().code);
      })
      .catch((cause: unknown) => console.error(failure, cause));
  };

  return {
    translateTo(language) {
      deps.translateWith(language);
      save(
        (current) => ({
          ...current,
          recentTargets: withRecentTarget(current.recentTargets, language.value),
        }),
        "Lambë could not remember the language.",
      );
    },
    autoTranslateSite() {
      deps.sendToWorker({ type: "lambe/open-options", section: "sites", origin: deps.origin });
    },
    hideOnSite() {
      save(
        (current) => ({
          ...current,
          sites: withSiteRule(current.sites, {
            ...siteRuleOf(current.sites, deps.origin),
            hideBubble: true,
          }),
        }),
        "Lambë could not hide its bubble on this site.",
      );
    },
    openSettings() {
      deps.sendToWorker({ type: "lambe/open-options" });
    },
  };
}
