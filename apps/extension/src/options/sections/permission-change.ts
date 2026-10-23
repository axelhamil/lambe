import { Option } from "@lambe/kernel/option";
import { Result } from "@lambe/kernel/result";
import type { HostAccess } from "../../access/host-access";
import { isGranted } from "../../access/registrations";
import { remotePatternOf, sitePatternOf } from "../../access/web-origin";
import { type MessageKey, t } from "../../i18n/t";
import { LOCAL_HOSTS, OPTIONAL_HOSTS, YOUTUBE_MATCHES } from "../../permissions";
import type { Settings } from "../../settings/settings";
import type { SettingsProblem } from "../../settings/settings-store";
import { problemNotice } from "./settings-access";

export interface PermissionDeps {
  access: HostAccess;
  update(change: (current: Settings) => Settings): Promise<Result<void, SettingsProblem>>;
}

export type ChangeError = { code: "PERMISSION_DENIED" } | SettingsProblem;

export type KeptReason = "neededElsewhere" | "httpSites";

export interface ChangeDone {
  kept: KeptReason[];
}

export type Change = Result<ChangeDone, ChangeError>;

export interface ToggleState {
  on: boolean;
  permissionMissing: boolean;
}

const DENIED: Change = Result.fail({ code: "PERMISSION_DENIED" });

const DONE: ChangeDone = { kept: [] };

const KEPT_NOTICE: Record<KeptReason, MessageKey> = {
  neededElsewhere: "options.sites.keptNeeded",
  httpSites: "options.sites.keptHttp",
};

export function toggleState(on: boolean, granted: string[], patterns: string[]): ToggleState {
  return { on, permissionMissing: on && !patterns.every((pattern) => isGranted(granted, pattern)) };
}

function neededOrigins(settings: Settings): string[] {
  const sites = settings.sites
    .filter((rule) => rule.autoTranslate || rule.hideBubble)
    .flatMap((rule) =>
      sitePatternOf(rule.origin)
        .map((pattern) => [pattern])
        .unwrapOr([]),
    );

  return [
    ...(settings.bubbleEverywhere ? OPTIONAL_HOSTS : []),
    ...(settings.youtube ? YOUTUBE_MATCHES : []),
    ...remotePatternOf(settings.provider.baseUrl)
      .map((pattern) => [pattern])
      .unwrapOr([]),
    ...sites,
  ];
}

function stillNeeded(origin: string, needed: string[]): boolean {
  return isGranted(needed, origin) || needed.some((pattern) => isGranted([origin], pattern));
}

function isLocalOnly(origin: string): boolean {
  return isGranted(LOCAL_HOSTS, origin);
}

function coversLocalHosts(origin: string): boolean {
  return LOCAL_HOSTS.some((local) => isGranted([origin], local));
}

type Release = { kind: "remove" } | { kind: "skip" } | { kind: "keep"; reason: KeptReason };

function releaseOf(origin: string, needed: string[]): Release {
  if (isLocalOnly(origin)) return { kind: "skip" };

  if (stillNeeded(origin, needed)) return { kind: "keep", reason: "neededElsewhere" };

  if (coversLocalHosts(origin)) return { kind: "keep", reason: "httpSites" };

  return { kind: "remove" };
}

export function changeNoticeOf(change: Change): Option<string> {
  if (change.isFailure) {
    const error = change.getError();

    return Option.some(
      error.code === "PERMISSION_DENIED" ? t("options.sites.denied") : problemNotice(error),
    );
  }

  const reasons = [...new Set(change.getValue().kept)];

  if (reasons.length === 0) return Option.none();

  return Option.some(reasons.map((reason) => t(KEPT_NOTICE[reason])).join(" "));
}

export async function saveThenRelease(
  deps: PermissionDeps,
  change: (current: Settings) => Settings,
  origins: string[],
): Promise<Change> {
  let releases: [string, Release][] = [];

  const saved = await deps.update((current) => {
    const next = change(current);
    const needed = neededOrigins(next);

    releases = origins.map((origin) => [origin, releaseOf(origin, needed)]);

    return next;
  });

  if (saved.isFailure) return Result.fail(saved.getError());

  const released = releases.flatMap(([origin, release]) =>
    release.kind === "remove" ? [origin] : [],
  );
  const kept = releases.flatMap(([, release]) => (release.kind === "keep" ? [release.reason] : []));

  if (released.length > 0) await deps.access.remove(released);

  return Result.ok({ kept });
}

export async function grantThenSave(
  deps: PermissionDeps,
  origins: string[],
  change: (current: Settings) => Settings,
): Promise<Change> {
  const granted = await deps.access.request(origins);

  if (!granted) return DENIED;

  const saved = await deps.update(change);

  if (saved.isFailure) return Result.fail(saved.getError());

  return Result.ok(DONE);
}
