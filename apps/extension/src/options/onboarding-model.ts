import { grantConsent } from "../activation/consent-gate";
import { OPTIONAL_HOSTS, YOUTUBE_MATCHES } from "../permissions";
import type { Settings } from "../settings/settings";
import type { PermissionDeps } from "./sections/permission-change";
import type { Saved } from "./sections/settings-access";

export function onboardingOrigins(settings: Settings): string[] {
  if (settings.bubbleEverywhere) return OPTIONAL_HOSTS;

  if (settings.youtube) return YOUTUBE_MATCHES;

  return [];
}

export function onboardingModel(deps: PermissionDeps) {
  const consent = (settings: Settings, now: number): Promise<Saved> => {
    const origins = onboardingOrigins(settings);
    const requested =
      origins.length > 0 ? deps.access.request(origins).catch(() => false) : Promise.resolve(true);

    return requested.then(() => deps.update((current) => grantConsent(current, now)));
  };

  return { consent };
}
