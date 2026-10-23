import {
  CheckIcon,
  CircleCheckIcon,
  CircleXIcon,
  CopyIcon,
  PlugIcon,
  ShieldXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useState } from "react";
import { renderError } from "../../i18n/render-error";
import { t } from "../../i18n/t";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "../components/ui/input-group";
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "../components/ui/item";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip";
import type { ConnectionView, FixGuide, ProviderKind } from "./provider-model";

export interface CommandLineProps {
  text: string;
}

function CommandLine({ text }: CommandLineProps) {
  const [copied, setCopied] = useState(false);
  const label = copied ? t("options.provider.copied") : t("common.copy");

  const copy = (): void => {
    void navigator.clipboard.writeText(text).then(() => setCopied(true));
  };

  return (
    <InputGroup>
      <InputGroupInput readOnly value={text} aria-label={t("options.provider.command")} />
      <InputGroupAddon align="inline-end">
        <Tooltip>
          <TooltipTrigger asChild>
            <InputGroupButton size="icon-xs" aria-label={label} onClick={copy}>
              {copied ? <CheckIcon /> : <CopyIcon />}
            </InputGroupButton>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      </InputGroupAddon>
    </InputGroup>
  );
}

export interface OriginFixProps {
  fix: FixGuide[];
}

function OriginFix({ fix }: OriginFixProps) {
  return (
    <Tabs defaultValue="linux" className="w-full">
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
          <ol className="flex flex-col gap-list">
            {steps.map((step) => (
              <li key={step.kind === "command" ? step.text : step.note}>
                {step.kind === "command" ? (
                  <CommandLine text={step.text} />
                ) : (
                  <span className="flex flex-col gap-inline">
                    {t(`options.provider.fix.${step.note}`)}
                    {step.line.map((line) => <CommandLine key={line} text={line} />).toUndefined()}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </TabsContent>
      ))}
    </Tabs>
  );
}

export interface ConnectionResultProps {
  view: ConnectionView | undefined;
  kind: ProviderKind;
  installed: boolean;
}

function Untested() {
  return (
    <Item variant="muted">
      <ItemMedia variant="icon">
        <PlugIcon />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{t("options.provider.untestedTitle")}</ItemTitle>
        <ItemDescription>{t("options.provider.untested")}</ItemDescription>
      </ItemContent>
    </Item>
  );
}

export function ConnectionResult({ view, kind, installed }: ConnectionResultProps) {
  if (view === undefined) return <Untested />;

  if (view.kind === "denied") {
    return (
      <Alert variant="destructive">
        <ShieldXIcon />
        <AlertTitle>{t("options.provider.deniedTitle")}</AlertTitle>
        <AlertDescription>{t("options.provider.denied")}</AlertDescription>
      </Alert>
    );
  }

  if (view.kind === "error") {
    const unreachable = view.error.code === "PROVIDER_UNREACHABLE" && kind === "ollama";

    return (
      <Alert variant="destructive">
        <CircleXIcon />
        <AlertTitle>{t("options.provider.failedTitle")}</AlertTitle>
        <AlertDescription>
          <p>{renderError(view.error)}</p>
          {unreachable && <p>{t("options.provider.startHint")}</p>}
          {unreachable && <CommandLine text="ollama serve" />}
          {view.fix.length > 0 && <OriginFix fix={view.fix} />}
        </AlertDescription>
      </Alert>
    );
  }

  const ready = view.models.length > 0 && installed;
  const detail =
    view.models.length === 0
      ? t("options.provider.noModels")
      : t(installed ? "options.provider.modelInstalled" : "options.provider.modelMissing");

  return (
    <Alert role="status">
      {ready ? <CircleCheckIcon /> : <TriangleAlertIcon />}
      <AlertTitle>{t("options.provider.connectedTitle")}</AlertTitle>
      <AlertDescription>
        <p>{detail}</p>
        <p>{t("options.provider.modelCount", String(view.models.length))}</p>
      </AlertDescription>
    </Alert>
  );
}
