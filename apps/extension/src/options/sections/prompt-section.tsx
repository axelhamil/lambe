import { sha256Hasher } from "@lambe/translation/infrastructure/hashing/sha256-hasher";
import { RotateCcwIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { t } from "../../i18n/t";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Field, FieldDescription } from "../components/ui/field";
import { Textarea } from "../components/ui/textarea";
import { HelpTip, Tipped } from "../help-tip";
import { toastSaved } from "../saved-toast";
import { useSettings } from "../use-settings";
import { type PromptVersion, promptModel } from "./prompt-model";

const ID = "prompt-guidelines";

type PromptModel = ReturnType<typeof promptModel>;

export interface PromptEditorProps {
  model: PromptModel;
}

export interface PromptMetaProps {
  version: PromptVersion;
}

function PromptMeta({ version }: PromptMetaProps) {
  return (
    <span className="flex flex-wrap items-center gap-inline">
      <Badge variant="outline">{t("options.prompt.version", version.prompt)}</Badge>
      <Badge variant="outline">{t("options.prompt.guidelinesId", version.guidelinesId)}</Badge>
      <HelpTip topic={t("options.prompt.versionTopic")} text={t("options.prompt.versionTip")} />
    </span>
  );
}

function PromptEditor({ model }: PromptEditorProps) {
  const [draft, setDraft] = useState(model.text);
  const [version, setVersion] = useState<PromptVersion | undefined>(undefined);
  const custom = model.isCustom();
  const changed = model.hasChanges(draft);

  useEffect(() => {
    void model.version().then(setVersion);
  }, [model]);

  const save = async (): Promise<void> =>
    toastSaved(await model.save(draft), t("options.prompt.saved"));

  const reset = async (): Promise<void> =>
    toastSaved(await model.reset(), t("options.prompt.restored"));

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("options.prompt.label")}</h2>
        </CardTitle>
        <CardDescription>{t("options.prompt.hint")}</CardDescription>
        <CardAction className="flex items-center gap-inline">
          {changed && <Badge variant="secondary">{t("options.prompt.unsaved")}</Badge>}
          <Badge variant={custom ? "default" : "secondary"}>
            {t(custom ? "options.prompt.custom" : "options.prompt.default")}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <Field>
          <Textarea
            id={ID}
            aria-label={t("options.prompt.label")}
            aria-describedby={`${ID}-description`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <FieldDescription id={`${ID}-description`}>
            {t("options.prompt.cacheNote")}
          </FieldDescription>
          {version && <PromptMeta version={version} />}
        </Field>
      </CardContent>
      <CardFooter className="flex-wrap gap-inline">
        <Button disabled={!changed} onClick={() => void save()}>
          {t("options.prompt.save")}
        </Button>
        <Tipped tip={t("options.prompt.resetTip")}>
          <Button variant="outline" disabled={!custom} onClick={() => void reset()}>
            <RotateCcwIcon />
            {t("options.prompt.reset")}
          </Button>
        </Tipped>
      </CardFooter>
    </Card>
  );
}

export function PromptSection() {
  const { loaded, update } = useSettings();
  const model = useMemo(
    () => promptModel({ settings: loaded.settings, update, hasher: sha256Hasher }),
    [loaded.settings, update],
  );

  return <PromptEditor key={loaded.settings.prompt} model={model} />;
}
