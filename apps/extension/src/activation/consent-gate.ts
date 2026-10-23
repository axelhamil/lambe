import type { Settings } from "../settings/settings";
import type { SettingsStore } from "../settings/settings-store";

export function isConsented(settings: Settings): boolean {
  return settings.consentAt !== undefined;
}

export function grantConsent(settings: Settings, now: number): Settings {
  return { ...settings, consentAt: now };
}

export function withdrawConsent(settings: Settings): Settings {
  return { ...settings, consentAt: undefined };
}

export async function hasConsent(settings: SettingsStore): Promise<boolean> {
  const { settings: current } = await settings.load();

  return isConsented(current);
}

export async function runWithConsent(
  settings: SettingsStore,
  action: () => void,
  openSettings: () => void,
): Promise<void> {
  if (await hasConsent(settings)) {
    action();

    return;
  }

  openSettings();
}
