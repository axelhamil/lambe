import { Option } from "@lambe/kernel/option";
import { sitePatternOf, webOriginOf } from "../../access/web-origin";
import { OPTIONAL_HOSTS } from "../../permissions";
import type { Settings } from "../../settings/settings";
import { type SiteRule, siteRuleOf, withSiteRule } from "../../settings/site-rule";
import { hashParam } from "../section-model";
import {
  type Change,
  grantThenSave,
  type PermissionDeps,
  saveThenRelease,
  type ToggleState,
  toggleState,
} from "./permission-change";

export interface SiteRow {
  rule: SiteRule;
  permissionMissing: boolean;
}

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

export function originOf(input: string): Option<string> {
  const trimmed = input.trim();

  if (trimmed === "") return Option.none();

  return webOriginOf(HAS_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`);
}

export function pendingOriginOf(hash: string): Option<string> {
  return hashParam(hash, "origin")
    .filter((origin) => HAS_SCHEME.test(origin))
    .flatMap(originOf);
}

export function siteHost(origin: string): string {
  return new URL(origin).host;
}

export function siteLabel(origin: string): string {
  return new URL(origin).protocol === "http:" ? origin : siteHost(origin);
}

export function bubbleEverywhereState(settings: Settings, granted: string[]): ToggleState {
  return toggleState(settings.bubbleEverywhere, granted, OPTIONAL_HOSTS);
}

const patternsOf = (origin: string): string[] =>
  sitePatternOf(origin)
    .map((pattern) => [pattern])
    .unwrapOr([]);

export function siteRows(settings: Settings, granted: string[]): SiteRow[] {
  return settings.sites.map((rule) => ({
    rule,
    permissionMissing: toggleState(true, granted, patternsOf(rule.origin)).permissionMissing,
  }));
}

export function sitesModel(deps: PermissionDeps) {
  const removeRule = (origin: string): Promise<Change> =>
    saveThenRelease(
      deps,
      (current) => ({
        ...current,
        sites: current.sites.filter((rule) => rule.origin !== origin),
      }),
      patternsOf(origin),
    );

  const setRule = (rule: SiteRule): Promise<Change> => {
    if (!rule.autoTranslate && !rule.hideBubble) return removeRule(rule.origin);

    return grantThenSave(deps, patternsOf(rule.origin), (current) => ({
      ...current,
      sites: withSiteRule(current.sites, rule),
    }));
  };

  const addSite = (origin: string): Promise<Change> =>
    grantThenSave(deps, patternsOf(origin), (current) => ({
      ...current,
      sites: withSiteRule(current.sites, {
        ...siteRuleOf(current.sites, origin),
        autoTranslate: true,
      }),
    }));

  const setBubbleEverywhere = (on: boolean): Promise<Change> => {
    if (on) {
      return grantThenSave(deps, OPTIONAL_HOSTS, (current) => ({
        ...current,
        bubbleEverywhere: true,
      }));
    }

    return saveThenRelease(
      deps,
      (current) => ({ ...current, bubbleEverywhere: false }),
      OPTIONAL_HOSTS,
    );
  };

  return { setBubbleEverywhere, addSite, setRule, removeRule };
}
