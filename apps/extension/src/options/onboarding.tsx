import { ShieldIcon } from "lucide-react";
import { chromeHostAccess } from "../access/host-access";
import { isConsented } from "../activation/consent-gate";
import { t } from "../i18n/t";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "./components/ui/card";
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "./components/ui/item";
import { LambeGlyph } from "./lambe-glyph";
import { onboardingModel, onboardingOrigins } from "./onboarding-model";
import { useSettings } from "./use-settings";

export function Onboarding() {
  const { loaded, update } = useSettings();

  if (isConsented(loaded.settings)) return null;

  const consent = (): void => {
    void onboardingModel({ access: chromeHostAccess, update }).consent(loaded.settings, Date.now());
  };

  return (
    <Card aria-labelledby="onboarding-title">
      <CardHeader className="flex flex-col gap-block md:flex-row md:items-center">
        <LambeGlyph className="size-20 shrink-0 animate-ink motion-reduce:animate-none md:size-28" />
        <CardTitle>
          <h2 id="onboarding-title">{t("onboarding.title")}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-list">
        <p>{t("onboarding.disclosure")}</p>
        <p>{t("onboarding.local")}</p>
        <p>{t("onboarding.later")}</p>
        {onboardingOrigins(loaded.settings).length > 0 && (
          <Item variant="outline">
            <ItemMedia variant="icon">
              <ShieldIcon />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{t("onboarding.accessTitle")}</ItemTitle>
              <ItemDescription>{t("onboarding.access")}</ItemDescription>
            </ItemContent>
          </Item>
        )}
      </CardContent>
      <CardFooter>
        <Button size="lg" onClick={consent}>
          {t("onboarding.consent")}
        </Button>
      </CardFooter>
    </Card>
  );
}
