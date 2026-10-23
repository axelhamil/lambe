import { sha256Hasher } from "@lambe/translation/infrastructure/hashing/sha256-hasher";
import { useEffect, useMemo, useState } from "react";
import { t } from "../../i18n/t";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { useSettings } from "../use-settings";
import { type PromptVersion, promptModel } from "./prompt-model";
import { noticeOf } from "./settings-access";

type PromptModel = ReturnType<typeof promptModel>;

interface PromptEditorProps {
  model: PromptModel;
  notice: string;
  onNotice(notice: string): void;
}

function PromptEditor({ model, notice, onNotice }: PromptEditorProps) {
  const [draft, setDraft] = useState(model.text);
  const [version, setVersion] = useState<PromptVersion | undefined>(undefined);
  const custom = model.isCustom();

  useEffect(() => {
    void model.version().then(setVersion);
  }, [model]);

  const save = async (): Promise<void> =>
    onNotice(noticeOf(await model.save(draft), "options.prompt.saved"));

  const reset = async (): Promise<void> =>
    onNotice(noticeOf(await model.reset(), "options.prompt.restored"));

  return (
    <div className="flex flex-col gap-4">
      <p className="settings-meta flex flex-wrap items-center gap-x-3 gap-y-1">
        <Badge variant={custom ? "default" : "secondary"}>
          {t(custom ? "options.prompt.custom" : "options.prompt.default")}
        </Badge>
        {version && <span>{t("options.prompt.version", version.prompt)}</span>}
        {version?.guidelinesId && (
          <span>{t("options.prompt.guidelinesId", version.guidelinesId)}</span>
        )}
      </p>
      <Textarea
        className="prompt-guidelines"
        aria-label={t("options.prompt.label")}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          onNotice("");
        }}
      />
      <p className="settings-note">{t("options.prompt.hint")}</p>
      <p className="settings-note">{t("options.prompt.cacheNote")}</p>
      <span className="flex flex-wrap items-center gap-2">
        <Button disabled={!model.hasChanges(draft)} onClick={() => void save()}>
          {t("options.prompt.save")}
        </Button>
        <Button variant="outline" disabled={!custom} onClick={() => void reset()}>
          {t("options.prompt.reset")}
        </Button>
      </span>
      <p className="settings-status" role="status">
        {notice}
      </p>
    </div>
  );
}

export function PromptSection() {
  const { loaded, update } = useSettings();
  const [notice, setNotice] = useState("");
  const model = useMemo(
    () => promptModel({ settings: loaded.settings, update, hasher: sha256Hasher }),
    [loaded.settings, update],
  );

  return (
    <PromptEditor key={loaded.settings.prompt} model={model} notice={notice} onNotice={setNotice} />
  );
}
