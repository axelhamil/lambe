import { Option } from "@lambe/kernel/option";
import { useState } from "react";
import { t } from "../../i18n/t";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { type Change, changeNoticeOf } from "./permission-change";

interface PermissionMissingProps {
  onRegrant(): void;
}

interface ChangeNoticeProps {
  notice: Option<string>;
}

export function useChangeFeedback() {
  const [notice, setNotice] = useState(Option.none<string>());

  const follow = (change: Promise<Change>): void => {
    void change.then((result) => setNotice(changeNoticeOf(result)));
  };

  return { notice, follow };
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

export function ChangeNotice({ notice }: ChangeNoticeProps) {
  if (notice.isNone()) return null;

  return (
    <Alert className="change-notice" role="status">
      <AlertDescription>{notice.unwrap()}</AlertDescription>
    </Alert>
  );
}
