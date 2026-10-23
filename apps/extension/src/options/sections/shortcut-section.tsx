import { useEffect, useMemo, useState } from "react";
import { t } from "../../i18n/t";
import { Button } from "../components/ui/button";
import { shortcutKeys, shortcutModel } from "./shortcut-model";

interface ShortcutKeysProps {
  shortcut: string;
}

function ShortcutKeys({ shortcut }: ShortcutKeysProps) {
  if (shortcut === "")
    return <span className="shortcut-unset">{t("options.shortcut.notSet")}</span>;

  return (
    <kbd className="shortcut-keys flex flex-wrap items-center gap-1.5">
      {shortcutKeys(shortcut).map((key) => (
        <kbd key={key}>{key}</kbd>
      ))}
    </kbd>
  );
}

export function ShortcutSection() {
  const model = useMemo(() => shortcutModel({ commands: chrome.commands, tabs: chrome.tabs }), []);
  const [shortcut, setShortcut] = useState<string | undefined>(undefined);

  useEffect(() => {
    void model.current().then(setShortcut);
  }, [model]);

  return (
    <div className="flex flex-col items-start gap-5">
      <p className="shortcut-row flex flex-wrap items-center gap-x-6 gap-y-3">
        <span>{t("options.shortcut.action")}</span>
        {shortcut !== undefined && <ShortcutKeys shortcut={shortcut} />}
      </p>
      <p className="settings-note">{t("options.shortcut.hint")}</p>
      <Button variant="outline" onClick={() => void model.openShortcutSettings()}>
        {t("options.shortcut.change")}
      </Button>
    </div>
  );
}
