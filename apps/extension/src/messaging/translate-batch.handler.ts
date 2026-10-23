import type { BatchTranslateOptions } from "@lambe/translation/application/batch-translation.service";
import type { BatchTranslator } from "@lambe/translation/application/ports/batch-translator";
import type { ProviderCapacity } from "@lambe/translation/application/ports/provider-capacity";
import { providerError } from "@lambe/translation/domain/provider/provider-error";
import type { RuntimePort } from "./runtime-port";
import {
  clientMessageSchema,
  fromBatchRequestDto,
  type TranslateBatchResponse,
  translateMessageSchema,
  type WorkerMessage,
} from "./translate-batch.contract";

export type RespondToTranslate = (
  payload: unknown,
  options: BatchTranslateOptions,
) => Promise<TranslateBatchResponse>;

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
  options: BatchTranslateOptions = {},
): Promise<TranslateBatchResponse> {
  const dto = translateMessageSchema.shape.payload.safeParse(payload);

  if (!dto.success) return rejected(dto.error.message);

  const request = fromBatchRequestDto(dto.data);

  if (request.isFailure) return rejected(request.getError());

  try {
    const result = await translator.translate(request.getValue(), options);

    return result.match<TranslateBatchResponse>({
      ok: (outcomes) => ({ ok: true, outcomes }),
      fail: (error) => ({ ok: false, error }),
    });
  } catch (cause) {
    return unexpectedFailure(cause);
  }
}

export function serveTranslatePort(
  port: RuntimePort,
  respond: RespondToTranslate,
  capacity: ProviderCapacity,
): void {
  const running = new Map<string, AbortController>();
  let connected = true;

  const post = (message: WorkerMessage): void => {
    if (!connected) return;

    try {
      port.postMessage(message);
    } catch {
      connected = false;
    }
  };

  port.onDisconnect.addListener(() => {
    connected = false;

    for (const controller of running.values()) controller.abort();

    running.clear();
  });

  port.onMessage.addListener((message) => {
    const parsed = clientMessageSchema.safeParse(message);

    if (!parsed.success) return;

    const { requestId } = parsed.data;

    if (parsed.data.type === "cancel") {
      running.get(requestId)?.abort();

      return;
    }

    const controller = new AbortController();

    running.set(requestId, controller);
    void respond(parsed.data.payload, {
      signal: controller.signal,
      onOutcome: (outcome) => post({ type: "outcome", requestId, outcome }),
    })
      .catch(unexpectedFailure)
      .then((response) => {
        if (running.get(requestId) === controller) running.delete(requestId);

        post({
          type: "done",
          requestId,
          response,
          concurrency: capacity.concurrency().unwrapOr(1),
        });
      });
  });
}
