import { LanguageCode } from "@lambe/translation/domain/language/value-objects/language-code.vo";
import { modelFamilyOf } from "@lambe/translation/domain/prompt/prompt-adapter";
import { z } from "zod";

export const CONFIG_STORAGE_KEY = "lambe:config";

export interface ConfigStore {
  get(keys: string[]): Promise<Record<string, unknown>>;
}

const positiveInt = z.int().positive();

const providerSchema = z.object({
  kind: z.literal("ollama"),
  baseUrl: z.url(),
  model: z.string().min(1),
  concurrency: positiveInt,
  timeoutMs: positiveInt,
});

const languageCodeSchema = z.string().transform((value, context) =>
  LanguageCode.create(value).match({
    ok: (code) => code,
    fail: (message) => {
      context.addIssue({ code: "custom", message });

      return z.NEVER;
    },
  }),
);

const runtimeConfigSchema = z.object({
  provider: providerSchema,
  target: languageCodeSchema,
  contextTokens: positiveInt,
  maxSegmentsPerBatch: positiveInt,
  maxSegmentsPerRequest: positiveInt,
  firstRequestSegments: positiveInt,
  captionSentencesPerRequest: positiveInt,
  captionAheadMs: positiveInt,
});

const overridesSchema = runtimeConfigSchema
  .extend({ provider: providerSchema.partial(), target: z.string() })
  .partial();

export type RuntimeConfig = z.output<typeof runtimeConfigSchema>;

type ProviderConfig = z.output<typeof providerSchema>;

const DEFAULT_PROVIDER: ProviderConfig = {
  kind: "ollama",
  baseUrl: "http://localhost:11434",
  model: "translategemma:12b",
  concurrency: 8,
  timeoutMs: 120000,
};

const ENGLISH = LanguageCode.create("en").getValue();

function contextTokensFor(model: string): number {
  return modelFamilyOf(model) === "translategemma" ? 2048 : 8192;
}

function uiTarget(uiLanguage: string): LanguageCode {
  const primary = uiLanguage.split(/[-_]/)[0] ?? "";

  return LanguageCode.create(primary).unwrapOr(ENGLISH);
}

function defaultsFor(uiLanguage: string): RuntimeConfig {
  return {
    provider: DEFAULT_PROVIDER,
    target: uiTarget(uiLanguage),
    contextTokens: contextTokensFor(DEFAULT_PROVIDER.model),
    maxSegmentsPerBatch: 8,
    maxSegmentsPerRequest: 12,
    firstRequestSegments: 3,
    captionSentencesPerRequest: 6,
    captionAheadMs: 60000,
  };
}

async function readStored(store: ConfigStore): Promise<unknown> {
  try {
    const items = await store.get([CONFIG_STORAGE_KEY]);

    return items[CONFIG_STORAGE_KEY] ?? {};
  } catch {
    return undefined;
  }
}

export async function loadRuntimeConfig(
  store: ConfigStore,
  uiLanguage: string,
): Promise<RuntimeConfig> {
  const defaults = defaultsFor(uiLanguage);
  const overrides = overridesSchema.safeParse(await readStored(store));

  if (!overrides.success) return defaults;

  const provider = { ...defaults.provider, ...overrides.data.provider };
  const merged = runtimeConfigSchema.safeParse({
    ...defaults,
    target: defaults.target.value,
    contextTokens: contextTokensFor(provider.model),
    ...overrides.data,
    provider,
  });

  return merged.success ? merged.data : defaults;
}
