import type { SettingsStore } from "../settings/settings-store";

export async function hasConsent(settings: SettingsStore): Promise<boolean> {
  const { settings: current } = await settings.load();

  return current.consentAt !== undefined;
}
