import { LanguageCode } from "@lambe/translation/domain/language/value-objects/language-code.vo";
import { z } from "zod";
import { webUrlOf } from "../access/web-origin";
import { siteRuleSchema } from "./site-rule";

export const SETTINGS_VERSION = 1;

export const RECENT_TARGETS_LIMIT = 24;

const positiveInt = z.int().positive();

const baseUrlSchema = z
  .url()
  .refine(
    (value) => webUrlOf(value).isSome(),
    "Provider base URL must start with http:// or https://.",
  );

const targetSchema = z.string().refine((value) => LanguageCode.create(value).isSuccess, {
  message: "Target must be a BCP 47 language code such as fr or pt-BR.",
});

export const providerSettingsSchema = z.object({
  kind: z.enum(["ollama", "openai-compatible"]),
  baseUrl: baseUrlSchema,
  model: z.string().min(1),
  concurrency: positiveInt,
  timeoutMs: positiveInt,
});

export const settingsSchema = z.object({
  version: z.literal(SETTINGS_VERSION),
  consentAt: z.number().optional(),
  provider: providerSettingsSchema,
  target: targetSchema,
  recentTargets: z.array(targetSchema).max(RECENT_TARGETS_LIMIT).default([]),
  bubbleEverywhere: z.boolean(),
  youtube: z.boolean(),
  sites: z.array(siteRuleSchema),
  prompt: z.string(),
  debug: z.boolean(),
});

export type Settings = z.output<typeof settingsSchema>;

export type ProviderSettings = z.output<typeof providerSettingsSchema>;

const ENGLISH = "en";

function uiTarget(uiLanguage: string): string {
  const primary = uiLanguage.split(/[-_]/)[0] ?? "";

  return LanguageCode.create(primary).match({
    ok: (code) => code.value,
    fail: () => ENGLISH,
  });
}

export function defaultSettings(uiLanguage: string): Settings {
  return {
    version: SETTINGS_VERSION,
    consentAt: undefined,
    provider: {
      kind: "ollama",
      baseUrl: "http://localhost:11434",
      model: "translategemma:12b",
      concurrency: 8,
      timeoutMs: 120000,
    },
    target: uiTarget(uiLanguage),
    recentTargets: [],
    bubbleEverywhere: true,
    youtube: true,
    sites: [],
    prompt: "",
    debug: false,
  };
}
