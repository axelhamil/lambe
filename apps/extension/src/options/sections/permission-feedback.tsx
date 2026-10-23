import { Option } from "@lambe/kernel/option";
import { InfoIcon, ShieldAlertIcon } from "lucide-react";
import { useState } from "react";
import { t } from "../../i18n/t";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { toastResult } from "../saved-toast";
import { type Change, changeNoticeOf } from "./permission-change";

export interface PermissionMissingProps {
  onRegrant(): void;
}

export interface ChangeNoticeProps {
  notice: Option<string>;
}

export function useChangeFeedback() {
  const [notice, setNotice] = useState(Option.none<string>());

  const follow = (change: Promise<Change>, success = t("options.shell.saved")): void => {
    void change.then((result) => {
      setNotice(changeNoticeOf(result));

      toastResult(result, success);
    });
  };

  return { notice, follow };
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

export function ChangeNotice({ notice }: ChangeNoticeProps) {
  if (notice.isNone()) return null;

  return (
    <Alert role="status">
      <InfoIcon />
      <AlertDescription>{notice.unwrap()}</AlertDescription>
    </Alert>
  );
}
