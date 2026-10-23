import { Option } from "@lambe/kernel/option";
import { LanguageCode } from "@lambe/translation/domain/language/value-objects/language-code.vo";
import { modelFamilyOf } from "@lambe/translation/domain/prompt/prompt-adapter";
import type { ProviderSettings, Settings } from "../settings/settings";
import type { SettingsStore } from "../settings/settings-store";

export interface RuntimeConfig {
  provider: ProviderSettings;
  target: LanguageCode;
  contextTokens: number;
  maxSegmentsPerBatch: number;
  maxSegmentsPerRequest: number;
  firstRequestSegments: number;
  captionSentencesPerRequest: number;
  captionAheadMs: number;
  guidelines: Option<string>;
  debug: boolean;
}

const ENGINE = {
  maxSegmentsPerBatch: 8,
  maxSegmentsPerRequest: 12,
  firstRequestSegments: 3,
  captionSentencesPerRequest: 6,
  captionAheadMs: 60000,
};

const ENGLISH = LanguageCode.create("en").getValue();

function contextTokensFor(model: string): number {
  return modelFamilyOf(model) === "translategemma" ? 2048 : 8192;
}

export function toRuntimeConfig(settings: Settings): RuntimeConfig {
  return {
    ...ENGINE,
    provider: settings.provider,
    target: LanguageCode.create(settings.target).unwrapOr(ENGLISH),
    contextTokens: contextTokensFor(settings.provider.model),
    guidelines: Option.some(settings.prompt).filter((text) => text.trim() !== ""),
    debug: settings.debug,
  };
}

export async function loadRuntimeConfig(store: SettingsStore): Promise<RuntimeConfig> {
  const { settings } = await store.load();

  return toRuntimeConfig(settings);
}
