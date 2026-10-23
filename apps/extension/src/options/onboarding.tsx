import { t } from "../i18n/t";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "./components/ui/card";
import { LambeGlyph } from "./lambe-glyph";
import { useSettings } from "./use-settings";

export function Onboarding() {
  const { loaded, update } = useSettings();

  if (loaded.settings.consentAt !== undefined) return null;

  const consent = (): void => {
    void update((current) => ({ ...current, consentAt: Date.now() }));
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
      </CardContent>
      <CardFooter>
        <Button size="lg" onClick={consent}>
          {t("onboarding.consent")}
        </Button>
      </CardFooter>
    </Card>
  );
}
