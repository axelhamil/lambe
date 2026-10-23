import { useState } from "react";
import { renderError } from "../i18n/render-error";
import { t } from "../i18n/t";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { Button } from "./components/ui/button";
import { useSettings } from "./use-settings";

export function SettingsProblem() {
  const { loaded, reset } = useSettings();
  const [keeping, setKeeping] = useState(false);

  if (keeping || loaded.problem.isNone()) return null;

  const problem = loaded.problem.unwrap();

  return (
    <Alert className="settings-problem">
      <AlertTitle>{t("options.shell.problemTitle")}</AlertTitle>
      <AlertDescription className="gap-3">
        <p>{renderError({ code: problem.code })}</p>
        <ul className="settings-issues flex flex-col gap-1">
          {problem.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
        <span className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void reset()}>
            {t("options.shell.resetDefaults")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setKeeping(true)}>
            {t("options.shell.keepAndFix")}
          </Button>
        </span>
      </AlertDescription>
    </Alert>
  );
}
