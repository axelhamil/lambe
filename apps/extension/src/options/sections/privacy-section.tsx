import { useState } from "react";
import { renderError } from "../../i18n/render-error";
import { t } from "../../i18n/t";
import { Button } from "../components/ui/button";
import { PRIVACY_POLICY_URL } from "../project-links";
import { useSettings } from "../use-settings";
import { formatConsentDate, privacyModel } from "./privacy-model";

export function PrivacySection() {
  const { loaded, update } = useSettings();
  const [notice, setNotice] = useState("");
  const model = privacyModel({
    settings: loaded.settings,
    update,
    manifest: () => chrome.runtime.getManifest(),
  });
  const locale = chrome.i18n.getUILanguage();
  const consentAt = model.consentAt();

  const withdraw = async (): Promise<void> => {
    const saved = await model.withdraw();

    setNotice(
      saved.match({ ok: () => "", fail: (problem) => renderError({ code: problem.code }) }),
    );
  };

  return (
    <div className="flex flex-col gap-10">
      <section className="settings-group flex flex-col gap-3" aria-labelledby="privacy-data">
        <h2 id="privacy-data">{t("options.privacy.dataTitle")}</h2>
        <p>{t("onboarding.disclosure")}</p>
        <p>{t("onboarding.local")}</p>
      </section>
      <section
        className="settings-group flex flex-col items-start gap-3"
        aria-labelledby="privacy-consent"
      >
        <h2 id="privacy-consent">{t("options.privacy.consentTitle")}</h2>
        <p>
          {consentAt
            .map((at) => t("options.privacy.consentGiven", formatConsentDate(at, locale)))
            .unwrapOr(t("options.privacy.consentMissing"))}
        </p>
        {consentAt.isSome() && (
          <>
            <p className="settings-note">{t("options.privacy.withdrawHint")}</p>
            <Button variant="outline" onClick={() => void withdraw()}>
              {t("options.privacy.withdraw")}
            </Button>
          </>
        )}
        <p className="settings-status" role="status">
          {notice}
        </p>
      </section>
      <section
        className="settings-group flex flex-col items-start gap-3"
        aria-labelledby="privacy-about"
      >
        <h2 id="privacy-about">{t("options.privacy.aboutTitle")}</h2>
        <p>{t("options.privacy.version", model.version())}</p>
        <Button asChild variant="link" className="px-0">
          <a href={PRIVACY_POLICY_URL} target="_blank" rel="noreferrer">
            {t("options.privacy.policy")}
          </a>
        </Button>
      </section>
    </div>
  );
}
