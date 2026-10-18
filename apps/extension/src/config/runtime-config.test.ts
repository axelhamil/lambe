import { describe, expect, mock, test } from "bun:test";
import { type ConfigStore, loadRuntimeConfig } from "./runtime-config";

const storeWith = (items: Record<string, unknown>): ConfigStore => ({
  get: mock(async () => items),
});

describe("loadRuntimeConfig", () => {
  test("defaults_when_storage_is_empty", async () => {
    const config = await loadRuntimeConfig(storeWith({}), "fr-FR");

    expect(config.provider).toEqual({
      kind: "ollama",
      baseUrl: "http://localhost:11434",
      model: "translategemma:12b",
      concurrency: 1,
      timeoutMs: 120000,
    });
    expect(config.target.value).toBe("fr");
    expect(config.contextTokens).toBe(2048);
    expect(config.maxSegmentsPerBatch).toBe(8);
    expect(config.maxSegmentsPerRequest).toBe(12);
  });

  test("partial_override_is_merged", async () => {
    const config = await loadRuntimeConfig(
      storeWith({ "lambe:config": { provider: { timeoutMs: 5000 }, target: "pt-BR" } }),
      "fr-FR",
    );

    expect(config.provider.timeoutMs).toBe(5000);
    expect(config.provider.model).toBe("translategemma:12b");
    expect(config.target.value).toBe("pt-BR");
    expect(config.maxSegmentsPerBatch).toBe(8);
  });

  test("invalid_config_falls_back_to_defaults", async () => {
    const wrongTypes = await loadRuntimeConfig(
      storeWith({ "lambe:config": { provider: { concurrency: 0 }, target: "not a language" } }),
      "de",
    );
    const notAnObject = await loadRuntimeConfig(storeWith({ "lambe:config": "oops" }), "de");
    const failing = await loadRuntimeConfig(
      { get: mock(async () => Promise.reject(new Error("storage down"))) },
      "12-unknown",
    );

    expect(wrongTypes.provider.concurrency).toBe(1);
    expect(wrongTypes.target.value).toBe("de");
    expect(notAnObject.target.value).toBe("de");
    expect(failing.target.value).toBe("en");
    expect(failing.provider.model).toBe("translategemma:12b");
  });

  test("context_tokens_follow_model_family", async () => {
    const instruction = await loadRuntimeConfig(
      storeWith({ "lambe:config": { provider: { model: "qwen3:8b" } } }),
      "en",
    );
    const explicit = await loadRuntimeConfig(
      storeWith({ "lambe:config": { provider: { model: "qwen3:8b" }, contextTokens: 4096 } }),
      "en",
    );

    expect(instruction.contextTokens).toBe(8192);
    expect(explicit.contextTokens).toBe(4096);
  });
});
