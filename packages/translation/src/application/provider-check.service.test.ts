import { describe, expect, mock, test } from "bun:test";
import { Result } from "@lambe/kernel/result";
import { type ProviderError, providerError } from "../domain/provider/provider-error";
import type { ModelCatalog } from "./ports/model-catalog";
import { ProviderCheckService } from "./provider-check.service";

const catalogAnswering = (answer: Result<string[], ProviderError>): ModelCatalog => ({
  listModels: mock(async (_signal?: AbortSignal) => answer),
});

describe("ProviderCheckService", () => {
  test("reports_installed_model", async () => {
    const service = new ProviderCheckService({
      catalog: catalogAnswering(Result.ok(["gemma3:4b", "translategemma:12b"])),
    });

    const report = await service.check("translategemma:12b");

    expect(report.getValue()).toEqual({
      models: ["gemma3:4b", "translategemma:12b"],
      modelInstalled: true,
    });
  });

  test("reports_missing_model_with_the_installed_list", async () => {
    const service = new ProviderCheckService({
      catalog: catalogAnswering(Result.ok(["gemma3:4b"])),
    });

    const report = await service.check("translategemma:12b");

    expect(report.getValue()).toEqual({ models: ["gemma3:4b"], modelInstalled: false });
  });

  test("passes_the_provider_failure_through", async () => {
    const failure = providerError("PROVIDER_UNREACHABLE", "Ollama is not reachable.", {
      baseUrl: "http://localhost:11434",
    });
    const service = new ProviderCheckService({ catalog: catalogAnswering(Result.fail(failure)) });

    const report = await service.check("translategemma:12b");

    expect(report.getError()).toEqual(failure);
  });
});
