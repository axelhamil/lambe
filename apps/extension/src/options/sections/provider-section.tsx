import { Option } from "@lambe/kernel/option";
import { CircleXIcon } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { chromeHostAccess } from "../../access/host-access";
import { t } from "../../i18n/t";
import { defaultSettings } from "../../settings/settings";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardFooter } from "../components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldSeparator } from "../components/ui/field";
import { Input } from "../components/ui/input";
import { Spinner } from "../components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip";
import { TipLabel } from "../help-tip";
import { useSettings } from "../use-settings";
import { ConnectionResult } from "./provider-connection";
import { isProviderKind, KindChoice, ModelField } from "./provider-fields";
import {
  type ConnectionView,
  editBaseUrl,
  listedModel,
  type ProviderDraft,
  type ProviderSaveError,
  providerDraft,
  providerModel,
  type SaveResult,
  switchKind,
} from "./provider-model";
import { problemNotice } from "./settings-access";

const DEFAULT_PROVIDER = defaultSettings("en").provider;

function saveMessage(error: ProviderSaveError): string {
  switch (error.code) {
    case "ORIGIN_DENIED":
    case "BASE_URL_INVALID":
    case "MODEL_REQUIRED":
      return t(`options.provider.saveFailed.${error.code}`);
    default:
      return problemNotice(error);
  }
}

export function ProviderSection() {
  const { loaded, update, secrets } = useSettings();
  const [draft, setDraft] = useState(() => providerDraft(loaded.settings.provider, Option.none()));
  const [view, setView] = useState<ConnectionView>();
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState<SaveResult>();
  const savedBaseUrl = loaded.settings.provider.baseUrl;

  useEffect(() => {
    void secrets.apiKeyFor(savedBaseUrl).then((apiKey) => {
      setDraft((current) => ({ ...current, apiKey: apiKey.unwrapOr(current.apiKey) }));
    });
  }, [secrets, savedBaseUrl]);

  const model = () =>
    providerModel({
      extensionId: chrome.runtime.id,
      fetch: globalThis.fetch.bind(globalThis),
      hostAccess: chromeHostAccess,
      secrets,
      update,
    });

  const edit = (change: Partial<ProviderDraft>, keepView = false): void => {
    setDraft((current) => ({ ...current, ...change }));
    setSaved(undefined);

    if (!keepView) setView(undefined);
  };

  const changeKind = (value: string): void => {
    if (!isProviderKind(value)) return;

    setDraft((current) => switchKind(current, value));
    setView(undefined);
    setSaved(undefined);
  };

  const test = (): void => {
    setTesting(true);
    setSaved(undefined);
    void model()
      .testConnection(draft)
      .then(setView)
      .finally(() => setTesting(false));
  };

  const models = view?.kind === "ok" ? view.models : [];
  const listed = listedModel(draft.kind, models, draft.model);

  const save = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void model()
      .save(draft)
      .then((result) => {
        setSaved(result);

        if (result.isSuccess) toast.success(t("options.provider.saved"));
      });
  };

  const failure = saved?.isFailure ? saveMessage(saved.getError()) : undefined;

  return (
    <form className="flex flex-col gap-block" onSubmit={save} noValidate>
      <Card>
        <CardContent>
          <FieldGroup>
            <KindChoice value={draft.kind} onChange={changeKind} />
            <FieldSeparator />
            <Field>
              <TipLabel
                htmlFor="provider-base-url"
                label={t("options.provider.baseUrlLabel")}
                tip={t("options.provider.baseUrlTip", DEFAULT_PROVIDER.baseUrl)}
              />
              <Input
                id="provider-base-url"
                type="url"
                inputMode="url"
                value={draft.baseUrl}
                onChange={(event) =>
                  edit(editBaseUrl(draft, event.target.value, loaded.settings.provider))
                }
                aria-describedby="provider-base-url-description"
                autoComplete="off"
                spellCheck={false}
              />
              <FieldDescription id="provider-base-url-description">
                {t("options.provider.baseUrlHint")}
              </FieldDescription>
            </Field>
            {draft.kind === "openai-compatible" && (
              <Field>
                <TipLabel
                  htmlFor="provider-api-key"
                  label={t("options.provider.apiKeyLabel")}
                  tip={t("options.provider.apiKeyTip")}
                />
                <Input
                  id="provider-api-key"
                  type="password"
                  value={draft.apiKey}
                  onChange={(event) => edit({ apiKey: event.target.value })}
                  aria-describedby="provider-api-key-description"
                  autoComplete="off"
                  spellCheck={false}
                />
                <FieldDescription id="provider-api-key-description">
                  {t("options.provider.apiKeyHint")}
                </FieldDescription>
              </Field>
            )}
            <Field>
              <span className="flex flex-wrap items-center justify-between gap-inline">
                <TipLabel
                  htmlFor="provider-model"
                  label={t("options.provider.modelLabel")}
                  tip={t("options.provider.modelTip", DEFAULT_PROVIDER.model)}
                />
                {models.length > 0 && (
                  <Badge variant={listed.isSome() ? "secondary" : "destructive"}>
                    {t(
                      listed.isSome()
                        ? "options.provider.installed"
                        : "options.provider.notInstalled",
                    )}
                  </Badge>
                )}
              </span>
              <ModelField
                draft={draft}
                models={models}
                listed={listed}
                onChange={(next) => edit({ model: next }, true)}
              />
              <FieldDescription id="provider-model-description">
                {t("options.provider.modelHint")}
              </FieldDescription>
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter className="flex-wrap gap-inline">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="outline" onClick={test} disabled={testing}>
                {testing && <Spinner aria-label={t("options.provider.testing")} />}
                {t(testing ? "options.provider.testing" : "options.provider.test")}
              </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{t("options.provider.testTip")}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="submit">{t("options.provider.save")}</Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{t("options.provider.saveTip")}</TooltipContent>
          </Tooltip>
        </CardFooter>
      </Card>
      {failure && (
        <Alert variant="destructive">
          <CircleXIcon />
          <AlertTitle>{t("options.shell.notSaved")}</AlertTitle>
          <AlertDescription>{failure}</AlertDescription>
        </Alert>
      )}
      <ConnectionResult view={view} kind={draft.kind} installed={listed.isSome()} />
    </form>
  );
}
