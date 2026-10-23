import { ExternalLinkIcon, KeyboardIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { t } from "../../i18n/t";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardFooter } from "../components/ui/card";
import { Item, ItemActions, ItemContent, ItemMedia, ItemTitle } from "../components/ui/item";
import { Kbd, KbdGroup } from "../components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip";
import { HelpTip } from "../help-tip";
import { shortcutKeys, shortcutModel } from "./shortcut-model";

export interface ShortcutKeysProps {
  shortcut: string;
}

function ShortcutKeys({ shortcut }: ShortcutKeysProps) {
  if (shortcut === "") return <Badge variant="secondary">{t("options.shortcut.notSet")}</Badge>;

  return (
    <KbdGroup>
      {shortcutKeys(shortcut).map((key) => (
        <Kbd key={key}>{key}</Kbd>
      ))}
    </KbdGroup>
  );
}

export function ShortcutSection() {
  const model = useMemo(() => shortcutModel({ commands: chrome.commands, tabs: chrome.tabs }), []);
  const [shortcut, setShortcut] = useState<string | undefined>(undefined);

  useEffect(() => {
    void model.current().then(setShortcut);
  }, [model]);

  return (
    <Card>
      <CardContent className="flex flex-col gap-block">
        <Item variant="outline">
          <ItemMedia variant="icon">
            <KeyboardIcon />
          </ItemMedia>
          <ItemContent>
            <span className="flex items-center gap-tight">
              <ItemTitle>{t("options.shortcut.action")}</ItemTitle>
              <HelpTip
                topic={t("options.shortcut.action")}
                text={t("options.shortcut.actionTip")}
              />
            </span>
          </ItemContent>
          <ItemActions>
            {shortcut !== undefined && <ShortcutKeys shortcut={shortcut} />}
          </ItemActions>
        </Item>
        <CardDescription>{t("options.shortcut.hint")}</CardDescription>
      </CardContent>
      <CardFooter>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" onClick={() => void model.openShortcutSettings()}>
              <ExternalLinkIcon />
              {t("options.shortcut.change")}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("options.shortcut.changeTip")}</TooltipContent>
        </Tooltip>
      </CardFooter>
    </Card>
  );
}
