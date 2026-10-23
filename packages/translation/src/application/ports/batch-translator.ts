import type { Result } from "@lambe/kernel/result";
import type { ProviderError } from "../../domain/provider/provider-error";
import type {
  BatchRequest,
  BatchTranslateOptions,
  SegmentOutcome,
} from "../batch-translation.service";

export interface BatchTranslator {
  translate(
    request: BatchRequest,
    options?: BatchTranslateOptions,
  ): Promise<Result<SegmentOutcome[], ProviderError>>;
}
