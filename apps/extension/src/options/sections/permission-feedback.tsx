import { Option } from "@lambe/kernel/option";
import { useState } from "react";
import { renderError } from "../../i18n/render-error";
import { t } from "../../i18n/t";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import type { Change, ChangeError } from "./permission-change";

interface PermissionMissingProps {
  onRegrant(): void;
}

interface ChangeNoticeProps {
  error: Option<ChangeError>;
}

export function useChangeFeedback() {
  const [error, setError] = useState(Option.none<ChangeError>());

  const follow = (change: Promise<Change>): void => {
    void change.then((result) =>
      setError(result.isFailure ? Option.some(result.getError()) : Option.none()),
    );
  };

  return { error, follow };
}

export function PermissionMissing({ onRegrant }: PermissionMissingProps) {
  return (
    <p className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-2">
      <Badge variant="destructive">{t("options.sites.permissionMissing")}</Badge>
      <Button size="sm" variant="outline" onClick={onRegrant}>
        {t("options.sites.regrant")}
      </Button>
    </p>
  );
}

export function ChangeNotice({ error }: ChangeNoticeProps) {
  if (error.isNone()) return null;

  const failure = error.unwrap();
  const message =
    failure.code === "PERMISSION_DENIED"
      ? t("options.sites.denied")
      : renderError({ code: failure.code });

  return (
    <Alert className="change-notice" role="status">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
