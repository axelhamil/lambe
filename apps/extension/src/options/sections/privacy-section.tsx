import { ExternalLinkIcon, ShieldCheckIcon, ShieldOffIcon } from "lucide-react";
import { t } from "../../i18n/t";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "../components/ui/item";
import { ConfirmAction } from "../confirm-action";
import { PRIVACY_POLICY_URL } from "../project-links";
import { toastSaved } from "../saved-toast";
import { useSettings } from "../use-settings";
import { formatConsentDate, privacyModel } from "./privacy-model";

export function PrivacySection() {
  const { loaded, update, uiLanguage: locale } = useSettings();
  const model = privacyModel({
    settings: loaded.settings,
    update,
    manifest: () => chrome.runtime.getManifest(),
  });
  const consentAt = model.consentAt();

  const withdraw = async (): Promise<void> =>
    toastSaved(await model.withdraw(), t("options.privacy.withdrawn"));

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t("options.privacy.dataTitle")}</h2>
          </CardTitle>
          <CardDescription>{t("onboarding.disclosure")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-block">
          <p>{t("onboarding.local")}</p>
          <Item variant="outline">
            <ItemMedia variant="icon">
              {consentAt.isSome() ? <ShieldCheckIcon /> : <ShieldOffIcon />}
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{t("options.privacy.consentTitle")}</ItemTitle>
              <ItemDescription>
                {consentAt
                  .map((at) => t("options.privacy.consentGiven", formatConsentDate(at, locale)))
                  .unwrapOr(t("options.privacy.consentMissing"))}
              </ItemDescription>
            </ItemContent>
          </Item>
        </CardContent>
        {consentAt.isSome() && (
          <CardFooter>
            <ConfirmAction
              label={t("options.privacy.withdraw")}
              tip={t("options.privacy.withdrawHint")}
              title={t("options.privacy.withdrawTitle")}
              description={t("options.privacy.withdrawHint")}
              onConfirm={() => void withdraw()}
            />
          </CardFooter>
        )}
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t("options.privacy.aboutTitle")}</h2>
          </CardTitle>
          <CardDescription>{t("options.privacy.version", model.version())}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild variant="outline">
            <a href={PRIVACY_POLICY_URL} target="_blank" rel="noreferrer">
              <ExternalLinkIcon />
              {t("options.privacy.policy")}
            </a>
          </Button>
        </CardFooter>
      </Card>
    </>
  );
}
