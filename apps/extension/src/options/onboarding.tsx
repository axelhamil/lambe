import { chromeHostAccess } from "../access/host-access";
import { isConsented } from "../activation/consent-gate";
import { t } from "../i18n/t";
import { Button } from "./components/ui/button";
import { LambeGlyph } from "./lambe-glyph";
import { onboardingModel } from "./onboarding-model";
import { useSettings } from "./use-settings";

export function Onboarding() {
  const { loaded, update } = useSettings();

  if (isConsented(loaded.settings)) return null;

  const consent = (): void => {
    void onboardingModel({ access: chromeHostAccess, update }).consent(loaded.settings, Date.now());
  };

  return (
    <section
      className="onboarding grid gap-x-8 gap-y-5 md:grid-cols-[auto_1fr]"
      aria-labelledby="onboarding-title"
    >
      <LambeGlyph className="onboarding-glyph" />
      <div className="flex flex-col items-start gap-4">
        <h2 id="onboarding-title" className="onboarding-title">
          {t("onboarding.title")}
        </h2>
        <p>{t("onboarding.disclosure")}</p>
        <p>{t("onboarding.local")}</p>
        <p className="onboarding-note">{t("onboarding.later")}</p>
        <Button size="lg" onClick={consent}>
          {t("onboarding.consent")}
        </Button>
      </div>
    </section>
  );
}
