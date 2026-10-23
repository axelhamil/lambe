import type { Result } from "@lambe/kernel/result";
import type { ProviderError } from "../domain/provider/provider-error";
import type { ModelCatalog } from "./ports/model-catalog";

export interface ConnectionReport {
  models: string[];
  modelInstalled: boolean;
}

export interface ProviderCheckDeps {
  catalog: ModelCatalog;
}

export class ProviderCheckService {
  public constructor(private readonly deps: ProviderCheckDeps) {}

  public async check(
    model: string,
    signal?: AbortSignal,
  ): Promise<Result<ConnectionReport, ProviderError>> {
    const listed = await this.deps.catalog.listModels(signal);

    return listed.map((models) => ({ models, modelInstalled: models.includes(model) }));
  }
}
