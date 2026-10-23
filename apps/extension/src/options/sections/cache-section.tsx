import type { Option } from "@lambe/kernel/option";
import { CircleAlertIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  type CacheSize,
  StorageTranslationCache,
} from "../../adapters/chrome/storage-translation-cache";
import { t } from "../../i18n/t";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { Card, CardContent, CardDescription, CardFooter } from "../components/ui/card";
import { Item, ItemContent, ItemDescription } from "../components/ui/item";
import { Skeleton } from "../components/ui/skeleton";
import { ConfirmAction } from "../confirm-action";
import { HelpTip } from "../help-tip";
import { cacheModel, formatBytes, formatCount } from "./cache-model";

export interface CacheFiguresProps {
  size: CacheSize;
}

function CacheFigures({ size }: CacheFiguresProps) {
  const locale = chrome.i18n.getUILanguage();

  return (
    <span className="grid grid-cols-2 gap-list">
      <Item variant="muted">
        <ItemContent>
          <ItemDescription>{t("options.cache.entries")}</ItemDescription>
          <data value={size.entries}>{formatCount(size.entries, locale)}</data>
        </ItemContent>
      </Item>
      <Item variant="muted">
        <ItemContent>
          <span className="flex items-center gap-tight">
            <ItemDescription>{t("options.cache.bytes")}</ItemDescription>
            <HelpTip topic={t("options.cache.bytes")} text={t("options.cache.bytesTip")} />
          </span>
          <data value={size.bytes}>{formatBytes(size.bytes, locale)}</data>
        </ItemContent>
      </Item>
    </span>
  );
}

function CacheUnavailable() {
  return (
    <Alert variant="destructive">
      <CircleAlertIcon />
      <AlertTitle>{t("options.cache.unavailableTitle")}</AlertTitle>
      <AlertDescription>{t("options.cache.unavailable")}</AlertDescription>
    </Alert>
  );
}

export function CacheSection() {
  const model = useMemo(() => cacheModel(new StorageTranslationCache(chrome.storage.local)), []);
  const [size, setSize] = useState<Option<CacheSize> | undefined>(undefined);

  useEffect(() => {
    void model.read().then(setSize);
  }, [model]);

  const clear = async (): Promise<void> => {
    const next = await model.clear();
    const cleared = next.map(({ entries }) => entries === 0).unwrapOr(false);

    setSize(next);

    if (cleared) toast.success(t("options.cache.cleared"));
  };

  const empty = size?.map(({ entries }) => entries === 0).unwrapOr(true) ?? true;

  return (
    <Card>
      <CardContent className="flex flex-col gap-block">
        {size === undefined && <Skeleton className="h-24 w-full" />}
        {size
          ?.map((value) => <CacheFigures key="figures" size={value} />)
          .unwrapOr(<CacheUnavailable />)}
        <CardDescription>
          {empty ? t("options.cache.empty") : t("options.cache.scope")}
        </CardDescription>
      </CardContent>
      <CardFooter>
        <ConfirmAction
          label={t("options.cache.clear")}
          tip={t("options.cache.clearTip")}
          title={t("options.cache.confirmTitle")}
          description={t("options.cache.confirmBody")}
          disabled={empty}
          onConfirm={() => void clear()}
        />
      </CardFooter>
    </Card>
  );
}
