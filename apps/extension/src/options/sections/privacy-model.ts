import { Option } from "@lambe/kernel/option";
import type { Saved, SettingsAccess } from "./settings-access";

interface PrivacyModelDeps extends SettingsAccess {
  manifest(): { version: string };
}

export function formatConsentDate(at: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(at);
}

export function privacyModel({ settings, update, manifest }: PrivacyModelDeps) {
  return {
    version: (): string => manifest().version,
    consentAt: (): Option<number> => Option.fromNullable(settings.consentAt),
    withdraw: (): Promise<Saved> => update((current) => ({ ...current, consentAt: undefined })),
  };
}
