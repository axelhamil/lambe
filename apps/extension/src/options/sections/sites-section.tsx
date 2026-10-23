import type { Option } from "@lambe/kernel/option";
import { GlobeIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { type FormEvent, useEffect, useId, useState } from "react";
import { chromeHostAccess } from "../../access/host-access";
import { t } from "../../i18n/t";
import { siteRuleOf } from "../../settings/site-rule";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../components/ui/empty";
import { Field, FieldDescription, FieldError } from "../components/ui/field";
import { Input } from "../components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemFooter,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "../components/ui/item";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip";
import { HelpTip, TipLabel } from "../help-tip";
import { hashOf } from "../section-model";
import { SwitchField } from "../switch-field";
import { useGrantedOrigins } from "../use-granted-origins";
import { useSettings } from "../use-settings";
import { ChangeNotice, PermissionMissing, useChangeFeedback } from "./permission-feedback";
import {
  bubbleEverywhereState,
  originOf,
  pendingOriginOf,
  type SiteRow,
  siteRows,
  sitesModel,
} from "./sites-model";

const ADD_ID = "add-site";

type SitesModel = ReturnType<typeof sitesModel>;

type Follow = ReturnType<typeof useChangeFeedback>["follow"];

export interface PendingSiteProps {
  origin: string;
  model: SitesModel;
  follow: Follow;
}

export interface RuleSwitchProps {
  id: string;
  label: string;
  tip: string;
  checked: boolean;
  onCheckedChange(on: boolean): void;
}

export interface SiteItemProps {
  row: SiteRow;
  missing: boolean;
  model: SitesModel;
  follow: Follow;
}

function usePendingOrigin(): Option<string> {
  const [pending, setPending] = useState(() => pendingOriginOf(window.location.hash));

  useEffect(() => {
    const onHashChange = (): void => setPending(pendingOriginOf(window.location.hash));

    window.addEventListener("hashchange", onHashChange);

    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return pending;
}

const dismissPending = (): void => {
  window.location.hash = hashOf("sites");
};

const hostOf = (origin: string): string => new URL(origin).host;

function PendingSite({ origin, model, follow }: PendingSiteProps) {
  const host = hostOf(origin);

  const confirm = (): void => {
    const change = model.addSite(origin);

    follow(change, t("options.sites.added", host));
    void change.then((result) => {
      if (result.isSuccess) dismissPending();
    });
  };

  return (
    <Alert>
      <GlobeIcon />
      <AlertTitle>{t("options.sites.pendingTitle", host)}</AlertTitle>
      <AlertDescription>
        <p>{t("options.sites.pendingBody")}</p>
        <span className="flex flex-wrap gap-inline">
          <Button size="sm" onClick={confirm}>
            {t("options.sites.pendingConfirm")}
          </Button>
          <Button size="sm" variant="ghost" onClick={dismissPending}>
            {t("options.sites.pendingDismiss")}
          </Button>
        </span>
      </AlertDescription>
    </Alert>
  );
}

function RuleSwitch({ id, label, tip, checked, onCheckedChange }: RuleSwitchProps) {
  return (
    <span className="flex items-center gap-inline">
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
      <Label htmlFor={id}>{label}</Label>
      <HelpTip topic={label} text={tip} />
    </span>
  );
}

function SiteItem({ row, missing, model, follow }: SiteItemProps) {
  const { rule } = row;
  const url = new URL(rule.origin);
  const name = url.protocol === "http:" ? rule.origin : url.host;
  const id = useId();
  const remove = t("options.sites.remove", url.host);

  return (
    <Item variant="outline" role="listitem">
      <ItemMedia variant="icon">
        <GlobeIcon />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{name}</ItemTitle>
      </ItemContent>
      <ItemActions>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={remove}
              onClick={() =>
                follow(model.removeRule(rule.origin), t("options.sites.removed", url.host))
              }
            >
              <Trash2Icon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("options.sites.removeTip")}</TooltipContent>
        </Tooltip>
      </ItemActions>
      <ItemFooter className="flex-wrap justify-start gap-x-block gap-y-list">
        <RuleSwitch
          id={`${id}-auto`}
          label={t("options.sites.autoTranslate")}
          tip={t("options.sites.autoTranslateTip")}
          checked={rule.autoTranslate}
          onCheckedChange={(on) => follow(model.setRule({ ...rule, autoTranslate: on }))}
        />
        <RuleSwitch
          id={`${id}-hide`}
          label={t("options.sites.hideBubble")}
          tip={t("options.sites.hideBubbleTip")}
          checked={rule.hideBubble}
          onCheckedChange={(on) => follow(model.setRule({ ...rule, hideBubble: on }))}
        />
      </ItemFooter>
      {missing && (
        <ItemFooter>
          <PermissionMissing onRegrant={() => follow(model.setRule(rule))} />
        </ItemFooter>
      )}
    </Item>
  );
}

function NoSites() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <GlobeIcon />
        </EmptyMedia>
        <EmptyTitle>{t("options.sites.emptyTitle")}</EmptyTitle>
        <EmptyDescription>{t("options.sites.listEmpty")}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export function SitesSection() {
  const { loaded, update } = useSettings();
  const granted = useGrantedOrigins();
  const pending = usePendingOrigin();
  const { error, follow } = useChangeFeedback();
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);
  const model = sitesModel({ access: chromeHostAccess, update });
  const settings = loaded.settings;
  const origins = granted.unwrapOr([]);
  const everywhere = bubbleEverywhereState(settings, origins);
  const rows = siteRows(settings, origins);
  const prompt = pending
    .filter((origin) => !siteRuleOf(settings.sites, origin).autoTranslate)
    .toUndefined();

  const addSite = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    const origin = originOf(draft);

    setInvalid(origin.isNone());

    if (origin.isNone()) return;

    const change = model.addSite(origin.unwrap());

    follow(change, t("options.sites.added", hostOf(origin.unwrap())));
    void change.then((result) => {
      if (result.isSuccess) setDraft("");
    });
  };

  return (
    <>
      {prompt && <PendingSite origin={prompt} model={model} follow={follow} />}
      <ChangeNotice error={error} />
      <Card>
        <CardContent>
          <SwitchField
            id="bubble-everywhere"
            label={t("options.sites.everywhereLabel")}
            description={t("options.sites.everywhereHint")}
            tip={t("options.sites.everywhereTip")}
            checked={everywhere.on}
            onCheckedChange={(on) => follow(model.setBubbleEverywhere(on))}
          >
            {granted.isSome() && everywhere.permissionMissing && (
              <PermissionMissing onRegrant={() => follow(model.setBubbleEverywhere(true))} />
            )}
          </SwitchField>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t("options.sites.listTitle")}</h2>
          </CardTitle>
          <CardDescription>{t("options.sites.listHint")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-block">
          <form onSubmit={addSite} noValidate>
            <Field data-invalid={invalid}>
              <TipLabel
                htmlFor={ADD_ID}
                label={t("options.sites.addLabel")}
                tip={t("options.sites.addTip")}
              />
              <span className="flex gap-inline">
                <Input
                  id={ADD_ID}
                  value={draft}
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={t("options.sites.addPlaceholder")}
                  aria-invalid={invalid}
                  aria-describedby={`${ADD_ID}-description`}
                  onChange={(event) => setDraft(event.target.value)}
                />
                <Button type="submit" variant="outline">
                  <PlusIcon />
                  {t("options.sites.addButton")}
                </Button>
              </span>
              {invalid ? (
                <FieldError id={`${ADD_ID}-description`}>
                  {t("options.sites.addInvalid")}
                </FieldError>
              ) : (
                <FieldDescription id={`${ADD_ID}-description`}>
                  {t("options.sites.addHint")}
                </FieldDescription>
              )}
            </Field>
          </form>
          {rows.length === 0 ? (
            <NoSites />
          ) : (
            <ItemGroup className="gap-list">
              {rows.map((row) => (
                <SiteItem
                  key={row.rule.origin}
                  row={row}
                  missing={granted.isSome() && row.permissionMissing}
                  model={model}
                  follow={follow}
                />
              ))}
            </ItemGroup>
          )}
        </CardContent>
      </Card>
    </>
  );
}
