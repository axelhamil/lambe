import { describe, expect, test } from "bun:test";
import { defaultSettings, type Settings } from "../settings/settings";
import { toRuntimeConfig } from "./runtime-config";

const settingsWith = (change: (defaults: Settings) => Settings): Settings =>
  change(defaultSettings("fr-FR"));

describe("toRuntimeConfig", () => {
  test("defaults_map_to_the_engine_constants", () => {
    const config = toRuntimeConfig(defaultSettings("fr-FR"));

    expect(config.provider).toEqual({
      kind: "ollama",
      baseUrl: "http://localhost:11434",
      model: "translategemma:12b",
      concurrency: 8,
      timeoutMs: 120000,
    });
    expect(config.target.value).toBe("fr");
    expect(config.contextTokens).toBe(2048);
    expect(config.maxSegmentsPerBatch).toBe(8);
    expect(config.maxSegmentsPerRequest).toBe(12);
    expect(config.firstRequestSegments).toBe(3);
    expect(config.captionSentencesPerRequest).toBe(6);
    expect(config.captionAheadMs).toBe(60000);
    expect(config.guidelines.isNone()).toBe(true);
    expect(config.debug).toBe(false);
  });

  test("user_settings_are_carried_over", () => {
    const config = toRuntimeConfig(
      settingsWith((defaults) => ({
        ...defaults,
        target: "pt-BR",
        provider: { ...defaults.provider, kind: "openai-compatible", timeoutMs: 5000 },
        prompt: "Keep it formal.",
        debug: true,
      })),
    );

    expect(config.target.value).toBe("pt-BR");
    expect(config.provider.kind).toBe("openai-compatible");
    expect(config.provider.timeoutMs).toBe(5000);
    expect(config.guidelines.unwrapOr("")).toBe("Keep it formal.");
    expect(config.debug).toBe(true);
  });

  test("blank_prompt_keeps_the_default_guidelines", () => {
    const config = toRuntimeConfig(settingsWith((defaults) => ({ ...defaults, prompt: "  \n" })));

    expect(config.guidelines.isNone()).toBe(true);
  });

  test("contexts_tokens_follow_the_model_family", () => {
    const config = toRuntimeConfig(
      settingsWith((defaults) => ({
        ...defaults,
        provider: { ...defaults.provider, model: "qwen3:8b" },
      })),
    );

    expect(config.contextTokens).toBe(8192);
  });
});
