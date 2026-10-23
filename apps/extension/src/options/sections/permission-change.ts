import { Result } from "@lambe/kernel/result";
import type { HostAccess } from "../../access/host-access";
import { isGranted, sitePatternOf } from "../../access/registrations";
import { LOCAL_HOSTS, OPTIONAL_HOSTS, YOUTUBE_MATCHES } from "../../permissions";
import type { Settings } from "../../settings/settings";
import type { SettingsProblem } from "../../settings/settings-store";

export interface SettingsAccess {
  access: HostAccess;
  update(change: (current: Settings) => Settings): Promise<Result<void, SettingsProblem>>;
}

export type ChangeError = { code: "PERMISSION_DENIED" } | SettingsProblem;

export type Change = Result<void, ChangeError>;

export interface ToggleState {
  on: boolean;
  permissionMissing: boolean;
}

const DENIED: Change = Result.fail({ code: "PERMISSION_DENIED" });

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
    ...sites,
  ];
}

function stillNeeded(origin: string, needed: string[]): boolean {
  return isGranted(needed, origin) || needed.some((pattern) => isGranted([origin], pattern));
}

function touchesLocalHosts(origin: string): boolean {
  return LOCAL_HOSTS.some((local) => isGranted([origin], local) || isGranted([local], origin));
}

export async function saveThenRelease(
  deps: SettingsAccess,
  change: (current: Settings) => Settings,
  origins: string[],
): Promise<Change> {
  let released: string[] = [];

  const saved = await deps.update((current) => {
    const next = change(current);
    const needed = neededOrigins(next);

    released = origins.some((origin) => stillNeeded(origin, needed))
      ? []
      : origins.filter((origin) => !touchesLocalHosts(origin));

    return next;
  });

  if (saved.isFailure) return saved;

  if (released.length > 0) await deps.access.remove(released);

  return Result.ok();
}

export async function grantThenSave(
  deps: SettingsAccess,
  origins: string[],
  change: (current: Settings) => Settings,
): Promise<Change> {
  const granted = await deps.access.request(origins);

  if (!granted) return DENIED;

  return deps.update(change);
}
