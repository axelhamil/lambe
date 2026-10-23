import type { Option } from "@lambe/kernel/option";
import { Trash2Icon } from "lucide-react";
import { type FormEvent, useEffect, useId, useState } from "react";
import { chromeHostAccess } from "../../access/host-access";
import { t } from "../../i18n/t";
import { siteRuleOf } from "../../settings/site-rule";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Switch } from "../components/ui/switch";
import { hashOf } from "../section-model";
import { SettingRow } from "../setting-row";
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

const EVERYWHERE_ID = "bubble-everywhere";

const ADD_ID = "add-site";

type SitesModel = ReturnType<typeof sitesModel>;

type Follow = ReturnType<typeof useChangeFeedback>["follow"];

interface PendingSiteProps {
  origin: string;
  model: SitesModel;
  follow: Follow;
}

interface LabeledSwitchProps {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange(on: boolean): void;
}

interface SiteItemProps {
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

function PendingSite({ origin, model, follow }: PendingSiteProps) {
  const host = new URL(origin).host;

  const confirm = (): void => {
    const change = model.addSite(origin);

    follow(change);
    void change.then((result) => {
      if (result.isSuccess) dismissPending();
    });
  };

  return (
    <section
      className="pending-site flex flex-col items-start gap-4"
      aria-labelledby="pending-title"
    >
      <h2 id="pending-title" className="pending-title">
        {t("options.sites.pendingTitle", host)}
      </h2>
      <p className="setting-hint">{t("options.sites.pendingBody")}</p>
      <span className="flex flex-wrap gap-2">
        <Button onClick={confirm}>{t("options.sites.pendingConfirm")}</Button>
        <Button variant="ghost" onClick={dismissPending}>
          {t("options.sites.pendingDismiss")}
        </Button>
      </span>
    </section>
  );
}

function LabeledSwitch({ id, label, checked, onCheckedChange }: LabeledSwitchProps) {
  return (
    <span className="flex items-center gap-2">
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
      <label htmlFor={id} className="switch-label">
        {label}
      </label>
    </span>
  );
}

function SiteItem({ row, missing, model, follow }: SiteItemProps) {
  const { rule } = row;
  const url = new URL(rule.origin);
  const id = useId();

  return (
    <li className="site-row grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3">
      <span className="site-origin">
        {url.protocol === "http:" && <span className="site-scheme">{`${url.protocol}//`}</span>}
        {url.host}
      </span>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("options.sites.remove", url.host)}
        onClick={() => follow(model.removeRule(rule.origin))}
      >
        <Trash2Icon />
      </Button>
      <span className="col-span-2 flex flex-wrap items-center gap-x-6 gap-y-3">
        <LabeledSwitch
          id={`${id}-auto`}
          label={t("options.sites.autoTranslate")}
          checked={rule.autoTranslate}
          onCheckedChange={(on) => follow(model.setRule({ ...rule, autoTranslate: on }))}
        />
        <LabeledSwitch
          id={`${id}-hide`}
          label={t("options.sites.hideBubble")}
          checked={rule.hideBubble}
          onCheckedChange={(on) => follow(model.setRule({ ...rule, hideBubble: on }))}
        />
      </span>
      {missing && <PermissionMissing onRegrant={() => follow(model.setRule(rule))} />}
    </li>
  );
}

export function SitesSection() {
  const { loaded, update } = useSettings();
  const granted = useGrantedOrigins();
  const pending = usePendingOrigin();
  const { notice, follow } = useChangeFeedback();
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

    follow(change);
    void change.then((result) => {
      if (result.isSuccess) setDraft("");
    });
  };

  return (
    <>
      {prompt && <PendingSite origin={prompt} model={model} follow={follow} />}
      <ChangeNotice notice={notice} />
      <div className="settings-panel">
        <SettingRow
          id={EVERYWHERE_ID}
          label={t("options.sites.everywhereLabel")}
          hint={t("options.sites.everywhereHint")}
          control={
            <Switch
              id={EVERYWHERE_ID}
              aria-describedby={`${EVERYWHERE_ID}-hint`}
              checked={everywhere.on}
              onCheckedChange={(on) => follow(model.setBubbleEverywhere(on))}
            />
          }
        >
          {granted.isSome() && everywhere.permissionMissing && (
            <PermissionMissing onRegrant={() => follow(model.setBubbleEverywhere(true))} />
          )}
        </SettingRow>
      </div>
      <section className="flex flex-col gap-4" aria-labelledby="sites-title">
        <span className="flex flex-col gap-1">
          <h2 id="sites-title" className="group-title">
            {t("options.sites.listTitle")}
          </h2>
          <p className="setting-hint">{t("options.sites.listHint")}</p>
        </span>
        <ul className="settings-panel">
          {rows.length === 0 && <li className="site-empty">{t("options.sites.listEmpty")}</li>}
          {rows.map((row) => (
            <SiteItem
              key={row.rule.origin}
              row={row}
              missing={granted.isSome() && row.permissionMissing}
              model={model}
              follow={follow}
            />
          ))}
        </ul>
        <form className="flex flex-col gap-2" onSubmit={addSite} noValidate>
          <label htmlFor={ADD_ID} className="setting-label">
            {t("options.sites.addLabel")}
          </label>
          <span className="flex gap-2">
            <Input
              id={ADD_ID}
              value={draft}
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder={t("options.sites.addPlaceholder")}
              aria-invalid={invalid}
              aria-describedby={invalid ? `${ADD_ID}-error` : undefined}
              onChange={(event) => setDraft(event.target.value)}
            />
            <Button type="submit" variant="outline">
              {t("options.sites.addButton")}
            </Button>
          </span>
          {invalid && (
            <p id={`${ADD_ID}-error`} className="field-error">
              {t("options.sites.addInvalid")}
            </p>
          )}
        </form>
      </section>
    </>
  );
}
