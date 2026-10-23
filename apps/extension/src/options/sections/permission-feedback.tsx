import { Option } from "@lambe/kernel/option";
import { CircleAlertIcon, ShieldAlertIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { renderError } from "../../i18n/render-error";
import { t } from "../../i18n/t";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import type { Change, ChangeError } from "./permission-change";

export interface PermissionMissingProps {
  onRegrant(): void;
}

export interface ChangeNoticeProps {
  error: Option<ChangeError>;
}

export function useChangeFeedback() {
  const [error, setError] = useState(Option.none<ChangeError>());

  const follow = (change: Promise<Change>, success = t("options.shell.saved")): void => {
    void change.then((result) => {
      setError(result.isFailure ? Option.some(result.getError()) : Option.none());

      if (result.isSuccess) toast.success(success);
    });
  };

  return { error, follow };
}

export function PermissionMissing({ onRegrant }: PermissionMissingProps) {
  return (
    <Alert>
      <ShieldAlertIcon />
      <AlertTitle>{t("options.sites.permissionMissing")}</AlertTitle>
      <AlertDescription>
        <p>{t("options.sites.permissionMissingBody")}</p>
        <Button size="sm" onClick={onRegrant}>
          {t("options.sites.regrant")}
        </Button>
      </AlertDescription>
    </Alert>
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
    <Alert variant="destructive">
      <CircleAlertIcon />
      <AlertTitle>{t("options.shell.notSaved")}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
