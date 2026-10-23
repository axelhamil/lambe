import { Option } from "@lambe/kernel/option";
import { CheckIcon, CopyIcon } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { chromeHostAccess } from "../../access/host-access";
import { renderError } from "../../i18n/render-error";
import { t } from "../../i18n/t";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Field, FieldDescription, FieldLabel } from "../components/ui/field";
import { Input } from "../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { useSettings } from "../use-settings";
import {
  type ConnectionView,
  type FixGuide,
  listedModel,
  type ProviderDraft,
  type ProviderKind,
  type ProviderSaveError,
  providerDraft,
  providerModel,
  type SaveResult,
  switchKind,
} from "./provider-model";

const KIND_LABEL = {
  ollama: "options.provider.kind.ollama",
  "openai-compatible": "options.provider.kind.openaiCompatible",
} as const;

const PROVIDER_KINDS: ProviderKind[] = ["ollama", "openai-compatible"];

const isProviderKind = (value: string): value is ProviderKind =>
  PROVIDER_KINDS.some((kind) => kind === value);

function saveMessage(error: ProviderSaveError): string {
  switch (error.code) {
    case "ORIGIN_DENIED":
    case "BASE_URL_INVALID":
    case "MODEL_REQUIRED":
      return t(`options.provider.saveFailed.${error.code}`);
    default:
      return renderError({ code: error.code });
  }
}

interface CommandLineProps {
  text: string;
}

function CommandLine({ text }: CommandLineProps) {
  const [copied, setCopied] = useState(false);

  const copy = (): void => {
    void navigator.clipboard.writeText(text).then(() => setCopied(true));
  };

  return (
    <span className="provider-command flex items-center gap-2">
      <code className="min-w-0 flex-1">{text}</code>
      <Button
        size="icon"
        variant="ghost"
        onClick={copy}
        aria-label={copied ? t("options.provider.copied") : t("common.copy")}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </Button>
    </span>
  );
}

interface OriginFixProps {
  fix: FixGuide[];
}

function OriginFix({ fix }: OriginFixProps) {
  return (
    <Tabs defaultValue="linux" className="w-full gap-3">
      <p>{t("options.provider.fixIntro")}</p>
      <TabsList>
        {fix.map(({ os }) => (
          <TabsTrigger key={os} value={os}>
            {t(`options.provider.os.${os}`)}
          </TabsTrigger>
        ))}
      </TabsList>
      {fix.map(({ os, steps }) => (
        <TabsContent key={os} value={os}>
          <ol className="provider-steps flex flex-col gap-2">
            {steps.map((step) => (
              <li key={step.kind === "command" ? step.text : step.note}>
                {step.kind === "command" ? (
                  <CommandLine text={step.text} />
                ) : (
                  <>
                    <p>{t(`options.provider.fix.${step.note}`)}</p>
                    {step.line.map((line) => <CommandLine key={line} text={line} />).toUndefined()}
                  </>
                )}
              </li>
            ))}
          </ol>
        </TabsContent>
      ))}
    </Tabs>
  );
}

interface ConnectionResultProps {
  view: ConnectionView;
  kind: ProviderKind;
  installed: boolean;
}

function ConnectionResult({ view, kind, installed }: ConnectionResultProps) {
  if (view.kind === "denied") {
    return (
      <Alert className="provider-result" data-state="error">
        <AlertTitle>{t("options.provider.deniedTitle")}</AlertTitle>
        <AlertDescription>{t("options.provider.denied")}</AlertDescription>
      </Alert>
    );
  }

  if (view.kind === "error") {
    const unreachable = view.error.code === "PROVIDER_UNREACHABLE" && kind === "ollama";

    return (
      <Alert className="provider-result" data-state="error">
        <AlertTitle>{t("options.provider.failedTitle")}</AlertTitle>
        <AlertDescription className="gap-3">
          <p>{renderError(view.error)}</p>
          {unreachable && (
            <>
              <p>{t("options.provider.startHint")}</p>
              <CommandLine text="ollama serve" />
            </>
          )}
          {view.fix.length > 0 && <OriginFix fix={view.fix} />}
        </AlertDescription>
      </Alert>
    );
  }

  const detail =
    view.models.length === 0
      ? t("options.provider.noModels")
      : t(installed ? "options.provider.modelInstalled" : "options.provider.modelMissing");

  return (
    <Alert className="provider-result" data-state={installed ? "ok" : "warning"}>
      <AlertTitle>{t("options.provider.connectedTitle")}</AlertTitle>
      <AlertDescription>{detail}</AlertDescription>
    </Alert>
  );
}

interface ModelFieldProps {
  draft: ProviderDraft;
  models: string[];
  listed: Option<string>;
  onChange(model: string): void;
}

function ModelField({ draft, models, listed, onChange }: ModelFieldProps) {
  if (models.length === 0) {
    return (
      <Input
        id="provider-model"
        value={draft.model}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
    );
  }

  const missing = draft.model !== "" && listed.isNone();

  return (
    <Select value={listed.unwrapOr(draft.model)} onValueChange={onChange}>
      <SelectTrigger id="provider-model" className="w-full">
        <SelectValue placeholder={t("options.provider.modelPlaceholder")} />
      </SelectTrigger>
      <SelectContent>
        {missing && (
          <SelectItem value={draft.model}>
            {draft.model} ({t("options.provider.modelNotInstalled")})
          </SelectItem>
        )}
        {models.map((model) => (
          <SelectItem key={model} value={model}>
            {model}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ProviderSection() {
  const { loaded, update, secrets } = useSettings();
  const [draft, setDraft] = useState(() => providerDraft(loaded.settings.provider, Option.none()));
  const [view, setView] = useState<ConnectionView>();
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState<SaveResult>();

  useEffect(() => {
    void secrets.apiKey().then((apiKey) => {
      setDraft((current) => ({ ...current, apiKey: apiKey.unwrapOr(current.apiKey) }));
    });
  }, [secrets]);

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
    void model().save(draft).then(setSaved);
  };

  return (
    <form className="provider-form flex flex-col gap-8" onSubmit={save} noValidate>
      <Field>
        <FieldLabel htmlFor="provider-kind">{t("options.provider.kindLabel")}</FieldLabel>
        <Select value={draft.kind} onValueChange={changeKind}>
          <SelectTrigger id="provider-kind" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROVIDER_KINDS.map((kind) => (
              <SelectItem key={kind} value={kind}>
                {t(KIND_LABEL[kind])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldDescription>{t("options.provider.kindHint")}</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="provider-base-url">{t("options.provider.baseUrlLabel")}</FieldLabel>
        <Input
          id="provider-base-url"
          type="url"
          inputMode="url"
          value={draft.baseUrl}
          onChange={(event) => edit({ baseUrl: event.target.value })}
          autoComplete="off"
          spellCheck={false}
        />
        <FieldDescription>{t("options.provider.baseUrlHint")}</FieldDescription>
      </Field>
      {draft.kind === "openai-compatible" && (
        <Field>
          <FieldLabel htmlFor="provider-api-key">{t("options.provider.apiKeyLabel")}</FieldLabel>
          <Input
            id="provider-api-key"
            type="password"
            value={draft.apiKey}
            onChange={(event) => edit({ apiKey: event.target.value })}
            autoComplete="off"
            spellCheck={false}
          />
          <FieldDescription>{t("options.provider.apiKeyHint")}</FieldDescription>
        </Field>
      )}
      <Field>
        <FieldLabel htmlFor="provider-model">{t("options.provider.modelLabel")}</FieldLabel>
        <ModelField
          draft={draft}
          models={models}
          listed={listed}
          onChange={(next) => edit({ model: next }, true)}
        />
        <FieldDescription>{t("options.provider.modelHint")}</FieldDescription>
      </Field>
      {view && <ConnectionResult view={view} kind={draft.kind} installed={listed.isSome()} />}
      <span className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" onClick={test} disabled={testing}>
          {t(testing ? "options.provider.testing" : "options.provider.test")}
        </Button>
        <Button type="submit">{t("options.provider.save")}</Button>
      </span>
      {saved && (
        <p className="provider-saved" role="status" data-state={saved.isSuccess ? "ok" : "error"}>
          {saved.match({ ok: () => t("options.provider.saved"), fail: saveMessage })}
        </p>
      )}
    </form>
  );
}
