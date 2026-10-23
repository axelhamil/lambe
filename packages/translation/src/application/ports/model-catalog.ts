import type { Result } from "@lambe/kernel/result";
import type { ProviderError } from "../../domain/provider/provider-error";

export interface ModelCatalog {
  listModels(signal?: AbortSignal): Promise<Result<string[], ProviderError>>;
}
