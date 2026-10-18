import type { BatchTranslator } from "@lambe/translation/application/ports/batch-translator";
import { providerError } from "@lambe/translation/domain/provider/provider-error";
import {
  fromBatchRequestDto,
  type TranslateBatchResponse,
  translateBatchRequestSchema,
} from "./translate-batch.contract";

const reasonOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

function rejected(message: string): TranslateBatchResponse {
  return {
    ok: false,
    error: providerError("PROVIDER_BAD_RESPONSE", `Invalid translate batch request: ${message}`),
  };
}

export function unexpectedFailure(cause: unknown): TranslateBatchResponse {
  return {
    ok: false,
    error: providerError(
      "PROVIDER_UNREACHABLE",
      `The translation worker failed: ${reasonOf(cause)}`,
    ),
  };
}

export async function respondToTranslateBatch(
  payload: unknown,
  translator: BatchTranslator,
): Promise<TranslateBatchResponse> {
  const dto = translateBatchRequestSchema.shape.payload.safeParse(payload);

  if (!dto.success) return rejected(dto.error.message);

  const request = fromBatchRequestDto(dto.data);

  if (request.isFailure) return rejected(request.getError());

  try {
    const result = await translator.translate(request.getValue());

    return result.match<TranslateBatchResponse>({
      ok: (outcomes) => ({ ok: true, outcomes }),
      fail: (error) => ({ ok: false, error }),
    });
  } catch (cause) {
    return unexpectedFailure(cause);
  }
}
