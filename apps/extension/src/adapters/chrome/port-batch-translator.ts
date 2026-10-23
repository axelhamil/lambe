import { Option } from "@lambe/kernel/option";
import { Result } from "@lambe/kernel/result";
import type {
  BatchRequest,
  BatchTranslateOptions,
  SegmentOutcome,
} from "@lambe/translation/application/batch-translation.service";
import type { BatchTranslator } from "@lambe/translation/application/ports/batch-translator";
import type { ProviderCapacity } from "@lambe/translation/application/ports/provider-capacity";
import {
  type ProviderError,
  providerError,
  requestCancelled,
} from "@lambe/translation/domain/provider/provider-error";
import type { RuntimePort } from "../../messaging/runtime-port";
import {
  addressedMessageSchema,
  type CancelMessage,
  type TranslateMessage,
  translateMessage,
  workerMessageSchema,
} from "../../messaging/translate-batch.contract";

export type ConnectWorker = () => RuntimePort;

type BatchResult = Result<SegmentOutcome[], ProviderError>;

interface Pending {
  port: RuntimePort;
  resolve: (result: BatchResult) => void;
  onOutcome: (outcome: SegmentOutcome) => void;
  release: () => void;
}

const reasonOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

const unreachable = (cause: unknown): ProviderError =>
  providerError(
    "PROVIDER_UNREACHABLE",
    `The extension worker is not reachable: ${reasonOf(cause)}`,
  );

const ignoreOutcome = (): void => undefined;

export class PortBatchTranslator implements BatchTranslator, ProviderCapacity {
  private port: RuntimePort | undefined;
  private reportedConcurrency: Option<number> = Option.none();
  private readonly pending = new Map<string, Pending>();
  private nextId = 0;

  public constructor(private readonly connect: ConnectWorker) {}

  public translate(
    request: BatchRequest,
    options: BatchTranslateOptions = {},
  ): Promise<BatchResult> {
    const { signal } = options;

    if (signal?.aborted) return Promise.resolve(Result.fail(requestCancelled()));

    const connected = this.connected();

    if (connected.isFailure) return Promise.resolve(Result.fail(connected.getError()));

    const port = connected.getValue();

    this.nextId += 1;

    const requestId = `${this.nextId}`;

    return new Promise((resolve) => {
      const onAbort = () => {
        this.post(port, { type: "cancel", requestId });
        this.settle(requestId, Result.fail(requestCancelled()));
      };

      signal?.addEventListener("abort", onAbort, { once: true });
      this.pending.set(requestId, {
        port,
        resolve,
        onOutcome: options.onOutcome ?? ignoreOutcome,
        release: () => signal?.removeEventListener("abort", onAbort),
      });

      const posted = this.post(port, translateMessage(requestId, request));

      if (posted.isFailure) this.settle(requestId, Result.fail(posted.getError()));
    });
  }

  public concurrency(): Option<number> {
    return this.reportedConcurrency;
  }

  public warmUp(): void {
    this.connected();
  }

  private connected(): Result<RuntimePort, ProviderError> {
    if (this.port !== undefined) return Result.ok(this.port);

    try {
      const port = this.connect();

      port.onMessage.addListener((message) => this.receive(message));
      port.onDisconnect.addListener(() => this.disconnected(port));
      this.port = port;

      return Result.ok(port);
    } catch (cause) {
      return Result.fail(unreachable(cause));
    }
  }

  private post(
    port: RuntimePort,
    message: TranslateMessage | CancelMessage,
  ): Result<void, ProviderError> {
    try {
      port.postMessage(message);

      return Result.ok();
    } catch (cause) {
      if (this.port === port) this.port = undefined;

      return Result.fail(unreachable(cause));
    }
  }

  private receive(message: unknown): void {
    const parsed = workerMessageSchema.safeParse(message);

    if (!parsed.success) {
      const addressed = addressedMessageSchema.safeParse(message);

      if (addressed.success) {
        this.settle(
          addressed.data.requestId,
          Result.fail(
            providerError(
              "PROVIDER_BAD_RESPONSE",
              "The extension worker sent a malformed message.",
            ),
          ),
        );
      }

      return;
    }

    if (parsed.data.type === "capacity") {
      this.reportedConcurrency = Option.some(parsed.data.concurrency);

      return;
    }

    const { requestId } = parsed.data;

    if (parsed.data.type === "outcome") {
      this.pending.get(requestId)?.onOutcome(parsed.data.outcome);

      return;
    }

    const { response, concurrency } = parsed.data;

    this.reportedConcurrency = Option.fromNullable(concurrency);
    this.settle(
      requestId,
      response.ok ? Result.ok(response.outcomes) : Result.fail(response.error),
    );
  }

  private disconnected(port: RuntimePort): void {
    if (this.port === port) this.port = undefined;

    for (const [requestId, pending] of this.pending) {
      if (pending.port === port) this.settle(requestId, Result.fail(requestCancelled()));
    }
  }

  private settle(requestId: string, result: BatchResult): void {
    const pending = this.pending.get(requestId);

    if (pending === undefined) return;

    this.pending.delete(requestId);
    pending.release();
    pending.resolve(result);
  }
}
