import type { Result } from "@lambe/kernel/result";
import type { ProviderError } from "../../domain/provider/provider-error";
import type { BatchRequest, SegmentOutcome } from "../batch-translation.service";

export interface BatchTranslator {
  translate(request: BatchRequest): Promise<Result<SegmentOutcome[], ProviderError>>;
}
