import { Result } from "@lambe/kernel/result";
import type {
  BatchRequest,
  SegmentOutcome,
} from "@lambe/translation/application/batch-translation.service";
import type { BatchTranslator } from "@lambe/translation/application/ports/batch-translator";
import {
  type ProviderError,
  providerError,
} from "@lambe/translation/domain/provider/provider-error";
import {
  type TranslateBatchRequest,
  translateBatchMessage,
  translateBatchResponseSchema,
} from "../../messaging/translate-batch.contract";

export type SendToWorker = (message: TranslateBatchRequest) => Promise<unknown>;

const reasonOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

export class RuntimeBatchTranslator implements BatchTranslator {
  public constructor(private readonly send: SendToWorker) {}

  public async translate(request: BatchRequest): Promise<Result<SegmentOutcome[], ProviderError>> {
    let response: unknown;

    try {
      response = await this.send(translateBatchMessage(request));
    } catch (cause) {
      return Result.fail(
        providerError(
          "PROVIDER_UNREACHABLE",
          `The extension worker is not reachable: ${reasonOf(cause)}`,
        ),
      );
    }

    const parsed = translateBatchResponseSchema.safeParse(response);

    if (!parsed.success) {
      return Result.fail(
        providerError("PROVIDER_BAD_RESPONSE", "The extension worker sent a malformed response."),
      );
    }

    if (!parsed.data.ok) return Result.fail(parsed.data.error);

    return Result.ok(parsed.data.outcomes);
  }
}
