import { createI18n } from "@wxt-dev/i18n";
import type { GeneratedI18nStructure } from "../../.wxt/i18n/structure";

export type MessageKey = Extract<keyof GeneratedI18nStructure, string>;

const i18n = createI18n();

/** @public */
export function t(key: MessageKey, ...substitutions: string[]): string {
  return i18n.t(key, substitutions);
}

export function catalogMessage(key: string): string {
  return chrome.i18n.getMessage(key.replaceAll(".", "_"));
}
