import type { Option } from "@lambe/kernel/option";
import { useEffect, useMemo, useState } from "react";
import {
  type CacheSize,
  StorageTranslationCache,
} from "../../adapters/chrome/storage-translation-cache";
import { t } from "../../i18n/t";
import { Button } from "../components/ui/button";
import { cacheModel, formatBytes, formatCount } from "./cache-model";

interface CacheFiguresProps {
  size: Option<CacheSize>;
}

function CacheFigures({ size }: CacheFiguresProps) {
  if (size.isNone()) return <p className="settings-status">{t("options.cache.unavailable")}</p>;

  const { entries, bytes } = size.unwrap();
  const locale = chrome.i18n.getUILanguage();

  return (
    <dl className="cache-figures grid grid-cols-2 gap-6">
      <div className="flex flex-col-reverse gap-1">
        <dt>{t("options.cache.entries")}</dt>
        <dd>{formatCount(entries, locale)}</dd>
      </div>
      <div className="flex flex-col-reverse gap-1">
        <dt>{t("options.cache.bytes")}</dt>
        <dd>{formatBytes(bytes, locale)}</dd>
      </div>
    </dl>
  );
}

export function CacheSection() {
  const model = useMemo(() => cacheModel(new StorageTranslationCache(chrome.storage.local)), []);
  const [size, setSize] = useState<Option<CacheSize> | undefined>(undefined);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    void model.read().then(setSize);
  }, [model]);

  const clear = async (): Promise<void> => {
    const next = await model.clear();

    setSize(next);
    setCleared(next.map(({ entries }) => entries === 0).unwrapOr(false));
  };

  const empty = size?.map(({ entries }) => entries === 0).unwrapOr(false) ?? false;

  return (
    <div className="flex flex-col items-start gap-5">
      {size && <CacheFigures size={size} />}
      <p className="settings-note">{t("options.cache.scope")}</p>
      <Button variant="outline" disabled={empty} onClick={() => void clear()}>
        {t("options.cache.clear")}
      </Button>
      <p className="settings-status" role="status">
        {cleared ? t("options.cache.cleared") : ""}
      </p>
    </div>
  );
}
